
import * as anchor from "@coral-xyz/anchor";
import { clusterApiUrl, PublicKey, Keypair, Connection, ComputeBudgetProgram, Transaction } from '@solana/web3.js';
import { bridges, userWallets } from "../db/schema";
import { bot, db } from "..";
import { eq, and } from "drizzle-orm";
import type { Attestation, Network, Signer, TransactionId, Wormhole } from "@wormhole-foundation/sdk";
import { CircleTransfer, TransferState, amount as amtt, wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import solana from "@wormhole-foundation/sdk/solana";
import { SOLANA_USDC_ADDRESS, evmAddressToBytes32, getDepositForBurnPdas, getPayer, getPrograms, solanaAddressToHex } from './utils';
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { getBytes } from "ethers";
import * as spl from '@solana/spl-token';

function verifyTransfer(data: any) {
    return data.type == "TRANSFER"
}

function verifyUSDC(data: any) {
    console.log(data.tokenTransfers[0]);
    
    return data.tokenTransfers.length > 0 && 
    data.tokenTransfers[0].mint && 
    data.tokenTransfers[0].mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' &&
    data.tokenTransfers[0].tokenAmount >= 0.1;
}

async function solHookHandler(data: any) {
    const recieverAddress = data.tokenTransfers[0].toUserAccount;
    const recieverAccount = data.tokenTransfers[0].toTokenAccount;

    const connection = new Connection(process.env.SOLANA_RPC_URL ?? clusterApiUrl("mainnet-beta"), "confirmed");
    const balance = await connection.getTokenAccountBalance(new PublicKey(recieverAccount));

    console.log("Balance:", balance.value.uiAmount);
    // if ((balance.value.uiAmount ?? 0) < 15) {
    //     console.log("Balance is low");
    //     return;
    // }

    console.log("Balance is sufficient");

    await bridgeSolArb(recieverAddress,recieverAccount , Number(balance.value.uiAmount));
}

async function bridgeSolArb(recieverAddress: any, recieverTokenAccount: string, amount: number) {
    const wallet = await db.select().from(userWallets).where(eq(userWallets.address, recieverAddress)).execute()
    const evmWallet = await db.select().from(userWallets).where(and(eq(userWallets.userId, wallet[0].userId), eq(userWallets.chainType, 'evm'))).execute()

    if (wallet.length == 0) {
        console.log("Wallet not found");
        return;
    }
    if (evmWallet.length == 0) {
        console.log("EVM Wallet not found");
        return;
    }

    await cctpSolArb(wallet[0], evmWallet[0], amount * (10 ** 6), recieverTokenAccount);

    

    bot.telegram.sendMessage(wallet[0].userId, "Bridged " + amount.toString() + " USDC from Solana to Arbitrum");
}

const cctpSolArb = async (
    srcWallet: {
        walletId: number;
        userId: string;
        chainType: string;
        address: string;
        private_key: string | null;
        createdAt: Date | null;
        lastUsed: Date | null;
    },
    destWallet: {
        walletId: number;
        userId: string;
        chainType: string;
        address: string;
        private_key: string | null;
        createdAt: Date | null;
        lastUsed: Date | null;
    },
    quantity: number,
    tokenAccount: string,
) => {
    const provider = new anchor.AnchorProvider(new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'), new anchor.Wallet(Keypair.fromSecretKey(bs58.decode(srcWallet.private_key ?? ''))), {});

    const payerProvider = new anchor.AnchorProvider(new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'), new anchor.Wallet(Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PAYER_PRIVATE_KEY ?? ''))), {});

    const { messageTransmitterProgram, tokenMessengerMinterProgram } = getPrograms(provider);

    // Init needed variables
    const usdcAddress = new PublicKey(SOLANA_USDC_ADDRESS);
    const userTokenAccount = new PublicKey(tokenAccount);

    // Default to 1 USDCSOL (e.g. $0.000001)
    const amount = new anchor.BN(quantity);
    const destinationDomain = Number(3); // Arbitrum
    // mintRecipient is a bytes32 type so pad with 0's then convert to a solana PublicKey
    const mintRecipient = new PublicKey(getBytes(evmAddressToBytes32(destWallet.address)));

    // Get pdas
    const pdas = getDepositForBurnPdas({messageTransmitterProgram, tokenMessengerMinterProgram}, usdcAddress, destinationDomain);

    // Generate a new keypair for the MessageSent event account.
    const messageSentEventAccountKeypair = Keypair.generate();

    console.log("\n\nCalling depositForBurn with parameters: ");
    console.log("amount:", amount.toString());
    console.log("destinationDomain:", destinationDomain);
    console.log("mintRecipient (hex):", destWallet.address); 
    console.log("mintRecipient (bytes52):", mintRecipient.toString());
    console.log("remoteTokenMessenger (hexa):", solanaAddressToHex(pdas.remoteTokenMessengerKey.publicKey.toString()))
    console.log("remoteTokenMessenger (bytes52):", pdas.remoteTokenMessengerKey.publicKey.toString());
    console.log("burnToken:", usdcAddress.toString());
    console.log("\n\n");

    // Call depositForBurn
    const depositForBurnTxUnsigned = await tokenMessengerMinterProgram.methods
    .depositForBurn({
        amount,
        destinationDomain,
        mintRecipient,
    })
    // eventAuthority and program accounts are implicitly added by Anchor 
    .accounts({
        owner: provider.wallet.publicKey,
        eventRentPayer: payerProvider.wallet.publicKey,
        senderAuthorityPda: pdas.authorityPda.publicKey,
        burnTokenAccount: userTokenAccount,
        messageTransmitter: pdas.messageTransmitterAccount.publicKey,
        tokenMessenger: pdas.tokenMessengerAccount.publicKey,
        remoteTokenMessenger: pdas.remoteTokenMessengerKey.publicKey,
        tokenMinter: pdas.tokenMinterAccount.publicKey,
        localToken: pdas.localToken.publicKey,
        burnTokenMint: usdcAddress,
        messageTransmitterProgram: messageTransmitterProgram.programId,
        tokenMessengerMinterProgram: tokenMessengerMinterProgram.programId,
        messageSentEventData: messageSentEventAccountKeypair.publicKey,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
    })
    // messageSentEventAccountKeypair must be a signer so the MessageTransmitter program can take control of it and write to it.
    // provider.wallet is also an implicit signer
    .transaction();

    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
        microLamports: 1000000
      });
    
      const finalTx = new Transaction()
        .add(addPriorityFee)
        .add(depositForBurnTxUnsigned)
        
        finalTx.feePayer = payerProvider.wallet.publicKey;

    const depositForBurnTx = await provider.sendAndConfirm(finalTx, [messageSentEventAccountKeypair,Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PAYER_PRIVATE_KEY ?? ''))], {
        commitment: "finalized",
        skipPreflight: true,
    });

    // Fetch message and attestation
    console.log("depositForBurn txHash:", depositForBurnTx);

    await db.insert(bridges).values({
        userId: srcWallet.userId,
        amount: Number(quantity).toFixed(0),
        sourceChainId: "solana",
        destinationChainId: "arbitrum",
        tokenSymbol: "USDC",
        status: "pending",
        sourceTxId: depositForBurnTx,
    })

    const wh = await wormhole("Mainnet", [evm, solana]);

    const sendChain = wh.getChain('Solana')

    const xfer = await CircleTransfer.from(wh, {
        chain: sendChain.chain,
        txid: depositForBurnTx,
      })

    const attestIds = await xfer.fetchAttestation(60 * 60 * 1000);
    console.log("Got attestation: ", attestIds);
    const attestationHex = (xfer.attestations?.at(0)?.attestation as Attestation)["attestation"];
    console.log("attestationHex:", attestationHex);

    const dstTxIds = await xfer.completeTransfer(
        (await getPayer(wh.getChain('Arbitrum')))
    );
    console.log("Completed transfer: ", dstTxIds);

    await db.update(bridges).set({
        status: "processed",
        destinationTxId: dstTxIds[0],
    }).where(and(eq(bridges.sourceTxId, depositForBurnTx), eq(bridges.userId, srcWallet.userId))).execute();
    // const {attestation: attestationHex} = response.messages[0];


    // Now, you can call receiveMessage on an EVM chain, see public quickstart for more information:
    // https://developers.circle.com/stablecoin/docs/cctp-usdc-transfer-quickstart

    // Example of reclaiming the rent from the MessageSent event account:
    const reclaimEventAccountTxUnsigned = await messageTransmitterProgram.methods
        .reclaimEventAccount({
            attestation: Buffer.from(attestationHex.replace("0x", ""), "hex"),
        })
        .accounts({
            payee: payerProvider.wallet.publicKey,
            messageTransmitter: pdas.messageTransmitterAccount.publicKey,
            messageSentEventData: messageSentEventAccountKeypair.publicKey,
        })
        .transaction();
        reclaimEventAccountTxUnsigned.feePayer = payerProvider.wallet.publicKey;

    payerProvider.sendAndConfirm(reclaimEventAccountTxUnsigned, [Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PAYER_PRIVATE_KEY ?? ''))]).then(
        (reclaimEventAccountTx) => {
            console.log("\n\nreclaimEventAccount txHash: ", reclaimEventAccountTx);
            console.log("Event account has been reclaimed and SOL paid for rent returned to payee.");
        }
    );
}


export {verifyUSDC, solHookHandler, verifyTransfer}