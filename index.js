import { ethers } from "ethers";
import FACTORY_ABI from "./abis/factory.json" assert { type: "json" };
import SWAP_ROUTER_ABI from "./abis/swaprouter.json" assert { type: "json" };
import POOL_ABI from "./abis/pool.json" assert { type: "json" };
import TOKEN_IN_ABI from "./abis/token.json" assert { type: "json" };
import ALPHA_HOMORA_ABI from "./abis/alphaHomora.json" assert { type: "json" };

import dotenv from "dotenv";
dotenv.config();

const POOL_FACTORY_CONTRACT_ADDRESS = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c";
const SWAP_ROUTER_CONTRACT_ADDRESS = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
const ALPHA_HOMORA_CONTRACT_ADDRESS = "0xYourAlphaHomoraAddress"; // Replace with actual address

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const factoryContract = new ethers.Contract(
  POOL_FACTORY_CONTRACT_ADDRESS,
  FACTORY_ABI,
  provider
);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Part A - Input Token Configuration
const USDC = {
  chainId: 11155111,
  address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  decimals: 6,
  symbol: "USDC",
  name: "USD//C",
  isToken: true,
  isNative: true,
  wrapped: false,
};

const LINK = {
  chainId: 11155111,
  address: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
  decimals: 18,
  symbol: "LINK",
  name: "Chainlink",
  isToken: true,
  isNative: true,
  wrapped: false,
};

// Part B - Write Approve Token Function
async function approveToken(tokenAddress, tokenABI, amount, wallet) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);
    const approveAmount = ethers.parseUnits(amount.toString(), USDC.decimals);
    const approveTransaction = await tokenContract.approve.populateTransaction(
      SWAP_ROUTER_CONTRACT_ADDRESS,
      approveAmount
    );
    const transactionResponse = await wallet.sendTransaction(approveTransaction);
    console.log(`-------------------------------`);
    console.log(`Sending Approval Transaction...`);
    console.log(`-------------------------------`);
    console.log(`Transaction Sent: ${transactionResponse.hash}`);
    console.log(`-------------------------------`);
    const receipt = await transactionResponse.wait();
    console.log(
      `Approval Transaction Confirmed! https://sepolia.etherscan.io/tx/${receipt.hash}`
    );
  } catch (error) {
    console.error("An error occurred during token approval:", error);
    throw new Error("Token approval failed");
  }
}

// Part C - Write Get Pool Info Function
async function getPoolInfo(factoryContract, tokenIn, tokenOut) {
  const poolAddress = await factoryContract.getPool(
    tokenIn.address,
    tokenOut.address,
    3000
  );
  if (!poolAddress) {
    throw new Error("Failed to get pool address");
  }
  const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const [token0, token1, fee] = await Promise.all([
    poolContract.token0(),
    poolContract.token1(),
    poolContract.fee(),
  ]);
  return { poolContract, token0, token1, fee };
}

// Part D - Write Prepare Swap Params Function
async function prepareSwapParams(poolContract, signer, amountIn) {
  return {
    tokenIn: USDC.address,
    tokenOut: LINK.address,
    fee: await poolContract.fee(),
    recipient: signer.address,
    amountIn: amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0,
  };
}

// Part E - Write Execute Swap Function
async function executeSwap(swapRouter, params, signer) {
  const transaction = await swapRouter.exactInputSingle.populateTransaction(params);
  const receipt = await signer.sendTransaction(transaction);
  console.log(`-------------------------------`);
  console.log(`Receipt: https://sepolia.etherscan.io/tx/${receipt.hash}`);
  console.log(`-------------------------------`);
}

// Part F - Write Alpha Homora Leverage Function
async function openLeveragedPosition(
  alphaHomoraContract,
  swapAmount,
  tokenIn,
  tokenOut,
  leverageMultiplier,
  signer
) {
  try {
    const amountIn = ethers.parseUnits(swapAmount.toString(), tokenIn.decimals);

    const leverageParams = {
      token: tokenOut.address,  // Token to receive (e.g., LINK)
      amount: amountIn,         // Amount to borrow and swap
      borrow: amountIn.mul(leverageMultiplier - 1), // Amount to borrow based on leverage
      minReceive: 0,            // Minimum amount to receive after swap (can add slippage protection)
      leverage: leverageMultiplier,  // Leverage amount (e.g., 2x, 3x)
    };

    const tx = await alphaHomoraContract.leverage(leverageParams);

    console.log(`-------------------------------`);
    console.log(`Opening Leveraged Position...`);
    console.log(`Transaction Sent: ${tx.hash}`);
    console.log(`-------------------------------`);

    const receipt = await tx.wait();
    console.log(
      `Leveraged Position Opened! https://sepolia.etherscan.io/tx/${receipt.hash}`
    );
  } catch (error) {
    console.error("An error occurred while opening a leveraged position:", error);
    throw new Error("Leverage position failed");
  }
}

// Part G - Write Main Function
async function main(swapAmount, leverageMultiplier) {
  const inputAmount = swapAmount;
  const amountIn = ethers.parseUnits(inputAmount.toString(), USDC.decimals);

  try {
    // Approve USDC for swap
    await approveToken(USDC.address, TOKEN_IN_ABI, inputAmount, signer);

    // Get Pool Info
    const { poolContract } = await getPoolInfo(factoryContract, USDC, LINK);

    // Prepare Swap Params and Execute Swap
    const params = await prepareSwapParams(poolContract, signer, amountIn);
    const swapRouter = new ethers.Contract(
      SWAP_ROUTER_CONTRACT_ADDRESS,
      SWAP_ROUTER_ABI,
      signer
    );
    await executeSwap(swapRouter, params, signer);

    // Alpha Homora - Open leveraged position
    const alphaHomoraContract = new ethers.Contract(
      ALPHA_HOMORA_CONTRACT_ADDRESS,
      ALPHA_HOMORA_ABI,
      signer
    );
    await openLeveragedPosition(
      alphaHomoraContract,
      swapAmount,
      USDC,
      LINK,
      leverageMultiplier,
      signer
    );
  } catch (error) {
    console.error("An error occurred:", error.message);
  }
}

// Enter Swap Amount and Leverage Multiplier
main(1, 2); // Example: Swap 1 USDC with 2x leverage
