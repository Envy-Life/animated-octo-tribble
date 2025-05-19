import Web3 from "web3";
import { db } from "..";
import { userWallets } from '../db/schema';
import { eq } from 'drizzle-orm';
import { ethers} from 'ethers';
import fs from 'fs';
import "dotenv/config";

async function bridgeHL(wallet: any, amount: number) {
    
    // const wallet = [
    //     {
    //         address: "0x6EfB095527371b7a49F62dCA2722EE2B92a20620",
    //         private_key: "8c04bad76d8afcf862f7cca9c7640c3d548679974d0cc89e064c9f87365c1dc9"
    //     }
    // ]


    const isMainnet = true;

      let etherWallet = new ethers.Wallet(wallet[0].private_key ?? "",new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL));

      const payer = new ethers.Wallet(process.env.EVM_PAYER_PRIVATE_KEY ?? "", new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL));
      

      let contract = new ethers.Contract(
        isMainnet ? "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7" : "0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89",
        JSON.parse(fs.readFileSync("./abi/hl.abi.json").toString()),
        payer
    )

    let erc20 = new ethers.Contract(
        isMainnet ? "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" : "0x1baAbB04529D43a73232B713C0FE471f7c7334d5",
        JSON.parse(fs.readFileSync("./abi/erc20.abi.json").toString()),
        payer
    )

    let deadline = ethers.getBigInt(Math.floor(Date.now() / 1000 + (60 * 60 * 24)));

    let data = await getPermitSignature(
        etherWallet,
        erc20,
        isMainnet ? "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7" : "0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89",
        amount,
        deadline,
    )

    console.log("Signature:", data);
    

    let tx = await contract.batchedDepositWithPermit(
        [
            [
                wallet[0].address,
                amount,
                deadline,
                [
                    data.r,
                    data.s,
                    data.v,
                ],
            ]
        ],
        {
            gasLimit: 1000000,
            gasPrice: ethers.parseUnits("1", "gwei"),
        },
    )

    let res = await tx.wait();
    console.log("Transaction:", tx);
    console.log("Response:", res);
    console.log("Transaction hash:", tx.hash);
    return tx.hash;
    
    
}

export async function getPermitSignature(
    wallet: ethers.Wallet,
    token: ethers.Contract,
    spender: string,
    value: ethers.BigNumberish = ethers.MaxUint256,
    deadline = ethers.MaxUint256,
    permitConfig?: { nonce?: ethers.BigNumberish; name?: string; chainId?: number; version?: string }
  ): Promise<ethers.Signature> {
    const [nonce, name, version, chainId] = await Promise.all([
      permitConfig?.nonce ?? token.nonces(wallet.address),
      permitConfig?.name ?? token.name(),
      permitConfig?.version ?? '2',
      permitConfig?.chainId ?? 42161,
    ])

    console.log("Nonce:", nonce);
    console.log("Name:", name);
    console.log("Version:", version);
    console.log("ChainId:", chainId);
    
  
    return ethers.Signature.from(
      await wallet.signTypedData(
        {
          name,
          version,
          chainId,
          verifyingContract: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        },
        {
          Permit: [
            {
              name: 'owner',
              type: 'address',
            },
            {
              name: 'spender',
              type: 'address',
            },
            {
              name: 'value',
              type: 'uint256',
            },
            {
              name: 'nonce',
              type: 'uint256',
            },
            {
              name: 'deadline',
              type: 'uint256',
            },
          ],
        },
        {
          owner: wallet.address,
          spender,
          value,
          nonce,
          deadline,
        }
      )
    )
  }

// bridgeHL("0x6EfB095527371b7a49F62dCA2722EE2B92a20620", 14 * 10 ** 6)

export default bridgeHL;

console.log();
