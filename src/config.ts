import { ethers } from "ethers";

const SEPOLIA_RPC = "https://rpc.sepolia.org"; // 公共 RPC

/** 查询交易详情 */
export async function getTransactionStatus(txHash: string) {
  try {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);

    // 1. 获取交易详情
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return { status: "not_found" };
    }

    // 2. 获取交易回执
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return {
        status: "pending",
        from: tx.from,
        to: tx.to,
        value: ethers.formatEther(tx.value),
      };
    }

    // 3. 已经上链
    return {
      status: receipt.status === 1 ? "success" : "failed",
      blockNumber: receipt.blockNumber,
      confirmations:
        (await provider.getBlockNumber()) - receipt.blockNumber + 1,
      from: tx.from,
      to: tx.to,
      value: ethers.formatEther(tx.value),
      gasUsed: receipt.gasUsed.toString(),
      txHash: txHash,
    };
  } catch (err) {
    console.error("查询交易失败:", err);
    throw err;
  }
}

export const sepoliaScan = (hash: string) => {
  return `https://sepolia.etherscan.io/tx/${hash}`;
};
