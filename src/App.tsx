import React, { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";

import { ERC20_ABI, ROUTER_ABI } from "./abi";

// UNI (Sepolia) 合约地址：0x1f9840a85d5af5bf1d1762f925bdaddc4201f984

const ROUTER_ADDRESS: string = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3"; // Uniswap V2 Router on Sepolia

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [fromAddr, setFromAddr] = useState<string>(""); // tokenIn
  const [toAddr, setToAddr] = useState<string>(""); // tokenOut
  const [amountInStr, setAmountInStr] = useState<string>("0.01"); // amount
  const [slippagePct, setSlippagePct] = useState<string>("1"); // percent

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const showStatus = (msg: string, delayMs: number = 5000) => {
    setStatus(msg);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (delayMs > 0) {
      timerRef.current = setTimeout(() => {
        setStatus("");
        timerRef.current = null;
      }, delayMs);
    }
  };

  const connect = async () => {
    if (!window.ethereum) return alert("请安装 MetaMask 或其它以太坊钱包");
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const a = await signer.getAddress();
      setAccount(a);
      setStatus("连接成功: " + a);
    } catch (e: any) {
      console.error(e);
      setStatus("连接失败: " + (e?.message || e));
    }
  };

  const doSwap = async () => {
    setStatus("开始准备 swap...");
    try {
      if (!window.ethereum) throw new Error("请先连接钱包");
      if (!toAddr) throw new Error("请填写 Token Out 地址");

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const walletAddr = await signer.getAddress();

      // router 用 provider 做只读查询
      const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);

      // 如果用 ETH 作为输入，使用 parseEther；否则读取 token 的 decimals
      let amountIn: bigint;
      let tokenInContract: ethers.Contract | undefined;
      if (!fromAddr) {
        // ETH 输入
        amountIn = ethers.parseEther(amountInStr);
      } else {
        // ERC20 输入
        tokenInContract = new ethers.Contract(fromAddr, ERC20_ABI, provider);
        const decimalsIn = await tokenInContract.decimals();
        amountIn = ethers.parseUnits(amountInStr, decimalsIn);
      }

      // 获取 path：如果 fromAddr 为空（ETH），从 router 读取 WETH 地址（避免手写错误）
      let path: string[] = [];
      if (!fromAddr) {
        const wethAddress = await router.WETH();
        // path: WETH -> tokenOut
        path = [wethAddress, toAddr];
      } else {
        path = [fromAddr, toAddr];
      }

      setStatus("查询报价 (getAmountsOut)...");
      // getAmountsOut 是只读
      const amountsOut = await router.getAmountsOut(amountIn, path);
      const estimatedOut = amountsOut[amountsOut.length - 1]; // 最后一项是输出数量 (bigint)

      // 计算最低接受量（整数百分比，避免精度问题）
      const slippageNum = Number(slippagePct || "1");
      if (isNaN(slippageNum) || slippageNum < 0)
        throw new Error("滑点填写错误");
      // amountOutMin = estimatedOut * (100 - slippage) / 100
      const amountOutMin =
        (estimatedOut * BigInt(Math.max(0, 100 - Math.round(slippageNum)))) /
        100n;

      // 读取 tokenOut decimals 用于展示
      const tokenOutContract = new ethers.Contract(toAddr, ERC20_ABI, provider);
      const tokenOutDecimals = await tokenOutContract.decimals();

      setStatus(
        `预计输出: ${ethers.formatUnits(
          estimatedOut,
          tokenOutDecimals
        )}, 最低接受: ${ethers.formatUnits(amountOutMin, tokenOutDecimals)}`
      );
      await sleep(4000);

      // setStatus(
      //   `预计输出: ${ethers.formatUnits(
      //     estimatedOut,
      //     tokenOutDecimals
      //   )}, 最低接受: ${ethers.formatUnits(amountOutMin, tokenOutDecimals)}`
      // );

      const routerWithSigner = router.connect(signer);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 分钟有效期

      if (!fromAddr) {
        // ETH -> Token
        setStatus("发送 swapExactETHForTokens...");
        const tx = await routerWithSigner.swapExactETHForTokens(
          amountOutMin,
          path,
          walletAddr,
          deadline,
          { value: amountIn }
        );
        setStatus("交易已发送: " + tx.hash);
        await tx.wait();
        setStatus("swap 成功: " + tx.hash);
      } else {
        // Token -> Token：需先 approve（若 allowance 不足）
        setStatus("检查 allowance...");
        const tokenInWithProvider = new ethers.Contract(
          fromAddr,
          ERC20_ABI,
          provider
        );
        const allowance = await tokenInWithProvider.allowance(
          walletAddr,
          ROUTER_ADDRESS
        );
        if (BigInt(allowance) < BigInt(amountIn)) {
          setStatus("批准 Router 转移代币 (approve)...");
          const tokenInWithSigner = tokenInContract!.connect(signer);
          const txApprove = await tokenInWithSigner.approve(
            ROUTER_ADDRESS,
            amountIn
          );
          await txApprove.wait();
          setStatus("approve 完成");
        } else {
          setStatus("已有足够 allowance");
        }

        setStatus("发送 swapExactTokensForTokens...");
        const tx = await routerWithSigner.swapExactTokensForTokens(
          amountIn,
          amountOutMin,
          path,
          walletAddr,
          deadline
        );
        setStatus("交易已发送: " + tx.hash);
        await tx.wait();
        setStatus("swap 成功: " + tx.hash);
      }
    } catch (err: any) {
      console.error(err);
      if (String(err).toLowerCase().includes("checksum")) {
        setStatus(
          "地址 checksum 校验失败：请确认你输入的地址是合法的 EVM 地址（或使用 router.WETH() 动态读取 WETH）。"
        );
      } else {
        setStatus("出错: " + (err?.message || String(err)));
      }
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div
      style={{ maxWidth: 600, margin: "80px auto", fontFamily: "sans-serif" }}
    >
      <h3>Sepolia Swap Demo (Uniswap V2 Router)</h3>
      <button style={{ padding: "10px 20px" }} onClick={connect}>
        连接钱包
      </button>
      <div style={{ marginTop: 10 }}>当前地址: 【{account ?? "未连接"}】</div>

      <div style={{ marginTop: 12 }}>
        <label>Token In</label>
        <br />
        <input
          value={fromAddr}
          onChange={(e) => setFromAddr(e.target.value.trim())}
          style={{ width: "100%", padding: 8 }}
          placeholder="默认使用钱包内的 ETH（会自动用 WETH 在 Router 中作为 path）"
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Token Out</label>
        <br />
        <input
          value={toAddr}
          onChange={(e) => setToAddr(e.target.value.trim())}
          style={{ width: "100%", padding: 8 }}
          placeholder="Sepolia 上的 ERC20 Token 地址"
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <label>数量</label>
        <br />
        <input
          style={{ padding: 8 }}
          value={amountInStr}
          onChange={(e) => {
            setAmountInStr(e.target.value);
            console.info(ethers.parseEther(e.target.value));
          }}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <label>滑点 (%)</label>
        <br />
        <input
          style={{ padding: 8 }}
          value={slippagePct}
          onChange={(e) => setSlippagePct(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <button style={{ padding: "10px 20px" }} onClick={doSwap}>
          执行 Swap
        </button>
      </div>

      <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
        状态: {status}
      </div>
    </div>
  );
}
