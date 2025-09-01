import React, { useState, useEffect } from "react";
import { ethers } from "ethers";

import { sepoliaScan } from "./config";

declare global {
  interface Window {
    ethereum?: any;
  }
}

const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 十六进制，11155111

export default function App() {
  const [account, setAccount] = useState<string>("-");
  const [chainId, setChainId] = useState<string>("-");
  const [status, setStatus] = useState<string>("未连接");
  const [to, setTo] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("-");
  const [balance, setBalance] = useState<string>("-");

  const requireEthereum = () => {
    if (!window.ethereum) throw new Error("未检测到 MetaMask，请先安装。");
    return window.ethereum;
  };

  /** 切换到 Sepolia */
  const ensureSepolia = async (eth: any) => {
    const currentHex = await eth.request({ method: "eth_chainId" });
    if (currentHex.toLowerCase() === SEPOLIA_CHAIN_ID) return;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (err: any) {
      if (err.code === 4902) {
        throw new Error("请手动在钱包中添加 Sepolia 网络。");
      } else {
        throw err;
      }
    }
  };

  /** 获取余额 */
  const loadBalance = async (addr: string) => {
    try {
      const eth = requireEthereum();
      const provider = new ethers.BrowserProvider(eth);
      const bal = await provider.getBalance(addr);
      setBalance(ethers.formatEther(bal) + " ETH");
    } catch (err) {
      console.error("获取余额失败", err);
      setBalance("-");
    }
  };

  /** 连接钱包 */
  const connect = async () => {
    try {
      const eth = requireEthereum();
      setStatus("连接中…");
      const accounts = (await eth.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts?.[0]) throw new Error("未获取到账户。");
      console.info(accounts);

      setAccount(accounts[0]);
      await ensureSepolia(eth);

      const chain = (await eth.request({ method: "eth_chainId" })) as string;
      setChainId(chain);
      setStatus("已连接，已在 Sepolia。");

      await loadBalance(accounts[0]);
    } catch (err: any) {
      setStatus("连接失败: " + err.message);
    }
  };

  /** 发送 ETH */
  const sendTx = async () => {
    try {
      const eth = requireEthereum();
      await ensureSepolia(eth);

      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();

      const value = ethers.parseEther(amount);

      const tx = await signer.sendTransaction({
        to,
        value,
      });

      setTxHash(tx.hash);
      setStatus("交易已提交，等待确认…");

      await tx.wait();
      setStatus("交易已确认 ✅");

      // 交易完成后更新余额
      if (account !== "-") {
        await loadBalance(account);
      }
    } catch (err: any) {
      setStatus("发送失败: " + err.message);
    }
  };

  /** 监听钱包变化 + 链接状态 */
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        setStatus("已连接");
        loadBalance(accounts[0]); // 账户切换时更新余额
      } else {
        setAccount("-");
        setBalance("-");
        setStatus("未连接");
      }
    };

    const handleChainChanged = (chainId: string) => {
      setChainId(chainId);
      setStatus("网络已切换");
      if (account !== "-") {
        loadBalance(account); // 网络切换时更新余额
      }
    };

    // 刷新时检查是否已授权过
    (async () => {
      try {
        const accounts = (await eth.request({
          method: "eth_accounts",
        })) as string[];
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          const chain = (await eth.request({
            method: "eth_chainId",
          })) as string;
          setChainId(chain);
          setStatus("已连接");
          await loadBalance(accounts[0]);
        }
      } catch (err) {
        console.error("初始化检测失败", err);
      }
    })();

    eth.on("accountsChanged", handleAccountsChanged);
    eth.on("chainChanged", handleChainChanged);

    return () => {
      if (!eth.removeListener) return;
      eth.removeListener("accountsChanged", handleAccountsChanged);
      eth.removeListener("chainChanged", handleChainChanged);
    };
  }, [account]);

  return (
    <div
      style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif" }}
    >
      <h2>MetaMask (Sepolia 转账)</h2>
      <button
        onClick={connect}
        style={{ padding: "10px 20px", marginBottom: 20 }}
      >
        连接钱包
      </button>
      <div>Account：【{account}】</div>
      <div>Chain ID：【{chainId}】</div>
      <div>Balance：【{balance}】</div>
      <div>Status：{status}</div>
      <hr />
      <h3>发起转账</h3>
      <div style={{ marginBottom: 10 }}>
        <input
          placeholder="收款地址 0x..."
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <input
          placeholder="金额 ETH，例如 0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>
      <button onClick={sendTx} style={{ padding: "10px 20px" }}>
        发起交易
      </button>
      <div style={{ marginTop: 10 }}>
        tx Hash：
        <a href={sepoliaScan(txHash)} target="_blank">
          {txHash}
        </a>
      </div>
    </div>
  );
}
