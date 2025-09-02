# 假设你有一个最简单的 ERC20 代币合约，里面有一个函数

```solidity
function balanceOf(address owner) external view returns (uint256);

```

它的 ABI 片段会长这样：

```json
[
  {
    "constant": true,
    "inputs": [{ "name": "owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
    "type": "function"
  }
]
```
