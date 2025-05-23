import { encodeBase58, ethers } from "ethers";
import { randomBytes } from "crypto";
import { Keypair } from "@solana/web3.js";
import * as schema from "../db/schema";
import { db, helius } from "..";
import { sql } from "drizzle-orm";
import { MyContext } from "../helpers/grammy";

async function initialiseUser(ctx: MyContext) {
  // Generate a random EVM wallet
  const evmWallet = ethers.Wallet.createRandom();
  const evmAddress = evmWallet.address;
  const evmPrivateKey = evmWallet.privateKey;

  // Generate a random Solana wallet
  const seed = randomBytes(32);
  const solanaKeypair = Keypair.fromSeed(seed);
  const solanaAddress = solanaKeypair.publicKey.toString();
  const solanaPrivateKey = encodeBase58(Buffer.from(solanaKeypair.secretKey));

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.users).values({
        userId: ctx.from?.id ? ctx.from.id.toString() : "",
        chatId: ctx.chat?.id ? ctx.chat.id.toString() : "",
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
        username: ctx.from?.username,
        isActive: true,
      });

      await tx.insert(schema.userWallets).values({
        userId: ctx.from?.id ? ctx.from.id.toString() : "",
        chainType: "evm",
        address: evmAddress,
        private_key: evmPrivateKey,
      });

      await tx.insert(schema.userWallets).values({
        userId: ctx.from?.id ? ctx.from.id.toString() : "",
        chainType: "solana",
        address: solanaAddress,
        private_key: solanaPrivateKey,
      });
    });

    await updateSolWebhooks(solanaAddress);
    await updateArbWebhooks(evmAddress);
    return;
  } catch (error) {
    rollback(ctx);
    await rollbackSolWebhooks(solanaAddress);
    await rollbackArbWebhooks(evmAddress);
    console.error("Error during user initialization:", error);
    throw error;
  }
}

async function updateSolWebhooks(address: string) {
  await helius.appendAddressesToWebhook(process.env.HELIUS_WEBHOOK_ID ?? "", [
    address,
  ]);
  console.log(`Webhook updated for address: ${address}`);
}

async function rollbackSolWebhooks(address: string) {
  await helius.removeAddressesFromWebhook(process.env.HELIUS_WEBHOOK_ID ?? "", [
    address,
  ]);
  console.log(`Webhook updated for address: ${address}`);
}

async function updateArbWebhooks(address: string) {
  var myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("x-api-key", process.env.QUICKNODE_API_KEY ?? ""); // Replace with your actual API key

  var requestOptions = {
    method: "PATCH",
    headers: myHeaders,
    redirect: "follow" as RequestRedirect,
    body: JSON.stringify({
      addItems: [address.toLowerCase()],
    }),
  };

  /// TODO: Replace quicknode with alchemy rpc
  await fetch(
    "https://api.quicknode.com/kv/rest/v1/lists/walletStore",
    requestOptions,
  );

  console.log(`Webhook updated for address: ${address}`);
}

async function rollbackArbWebhooks(address: string) {
  var myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("x-api-key", process.env.QUICKNODE_API_KEY ?? ""); // Replace with your actual API key

  var requestOptions = {
    method: "PATCH",
    headers: myHeaders,
    redirect: "follow" as RequestRedirect,
    body: JSON.stringify({
      removeItems: [address.toLowerCase()],
    }),
  };

  await fetch(
    "https://api.quicknode.com/kv/rest/v1/lists/{key}",
    requestOptions,
  );

  console.log(`Webhook updated for address: ${address}`);
}

async function rollback(ctx: MyContext) {
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.userWallets)
      .where(
        sql`${schema.userWallets.userId} = ${
          ctx.from?.id ? ctx.from.id.toString() : ""
        }`,
      );
    await tx
      .delete(schema.users)
      .where(
        sql`${schema.users.userId} = ${
          ctx.from?.id ? ctx.from.id.toString() : ""
        }`,
      );
  });
}

export { initialiseUser };
