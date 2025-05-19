import Web3 from "web3";
import { bot, db } from "..";
import bridgeHL from "../bridge/hl";
import { bridges, userWallets } from "../db/schema";
import { ethers } from "ethers";
import {eq} from 'drizzle-orm';

function stripPadding(address : string) {
    return "0x" + address.slice(-40).toLowerCase();
}

const minABI = [
    // balanceOf
    {
      constant: true,
  
      inputs: [{ name: '_owner', type: 'address' }],
  
      name: 'balanceOf',
  
      outputs: [{ name: 'balance', type: 'uint256'}],
  
      type: 'function',
    },
  ]

async function arbHookHandler(data: any) {
    const recieverAddress = ethers.getAddress(stripPadding(data.logs[0].topics[2]));
    

    const web3 = new Web3(process.env.ARBITRUM_RPC_URL);
    const contract = new web3.eth.Contract(minABI, "0xaf88d065e77c8cC2239327C5EDb3A432268e5831");

    const balance = await contract.methods.balanceOf(recieverAddress).call();
    console.log("Balance:", balance);

    // if (Number(balance) <= (15 * 10**6)) {
    //     // Send a message to the user
    //     console.log("Balance is low");
    //     return;
    // }
    console.log("Balance is sufficient");

    const wallet = await db.select().from(userWallets).where(eq(userWallets.address, recieverAddress)).execute()

    if (wallet.length == 0) {
        console.log("Wallet not found");
        return;
    }

    
    let txhash = await bridgeHL(wallet, Number(balance));

    await db.insert(bridges).values({
        userId: wallet[0].userId,
        amount: Number(balance).toFixed(0),
        sourceChainId: "arbitrum",
        destinationChainId: "hyperliquid",
        tokenSymbol: "USDC",
        status: "processed",
        sourceTxId: txhash,
        destinationTxId: txhash,
    }).execute();

    bot.telegram.sendMessage(wallet[0].userId, "Bridged " + (Number(balance) / (10 ** 6)).toFixed(3) + " USDC from Arbitrum to Hyperliquid");

}

export { arbHookHandler };