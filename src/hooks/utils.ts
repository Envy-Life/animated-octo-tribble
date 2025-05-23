/*
 * Copyright (c) 2024, Circle Internet Financial LTD All rights reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { hexlify } from "ethers";
import fetch from "node-fetch";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

import { MessageTransmitter } from "../../target/types/message_transmitter";
import { TokenMessengerMinter } from "../../target/types/token_messenger_minter";
import {
  ChainAddress,
  ChainContext,
  Network,
  Signer,
  Wormhole,
  Chain,
} from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import solana from "@wormhole-foundation/sdk/solana";

export const SOLANA_SRC_DOMAIN_ID = 5;
export const SOLANA_USDC_ADDRESS =
  process.env.SOLANA_USDC_ADDRESS ??
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface FindProgramAddressResponse {
  publicKey: anchor.web3.PublicKey;
  bump: number;
}

export const getPrograms = (provider: anchor.AnchorProvider) => {
  // Initialize contracts
  const messageTransmitterProgram = anchor.workspace
    .MessageTransmitter as anchor.Program<MessageTransmitter>;
  const tokenMessengerMinterProgram = anchor.workspace
    .TokenMessengerMinter as anchor.Program<TokenMessengerMinter>;
  return { messageTransmitterProgram, tokenMessengerMinterProgram };
};

export const getDepositForBurnPdas = (
  {
    messageTransmitterProgram,
    tokenMessengerMinterProgram,
  }: ReturnType<typeof getPrograms>,
  usdcAddress: PublicKey,
  destinationDomain: Number,
) => {
  const messageTransmitterAccount = findProgramAddress(
    "message_transmitter",
    messageTransmitterProgram.programId,
  );
  const tokenMessengerAccount = findProgramAddress(
    "token_messenger",
    tokenMessengerMinterProgram.programId,
  );
  const tokenMinterAccount = findProgramAddress(
    "token_minter",
    tokenMessengerMinterProgram.programId,
  );
  const localToken = findProgramAddress(
    "local_token",
    tokenMessengerMinterProgram.programId,
    [usdcAddress],
  );
  const remoteTokenMessengerKey = findProgramAddress(
    "remote_token_messenger",
    tokenMessengerMinterProgram.programId,
    [destinationDomain.toString()],
  );
  const authorityPda = findProgramAddress(
    "sender_authority",
    tokenMessengerMinterProgram.programId,
  );

  return {
    messageTransmitterAccount,
    tokenMessengerAccount,
    tokenMinterAccount,
    localToken,
    remoteTokenMessengerKey,
    authorityPda,
  };
};

export const getReceiveMessagePdas = async (
  {
    messageTransmitterProgram,
    tokenMessengerMinterProgram,
  }: ReturnType<typeof getPrograms>,
  solUsdcAddress: PublicKey,
  remoteUsdcAddressHex: string,
  remoteDomain: string,
  nonce: string,
) => {
  const tokenMessengerAccount = findProgramAddress(
    "token_messenger",
    tokenMessengerMinterProgram.programId,
  );
  const messageTransmitterAccount = findProgramAddress(
    "message_transmitter",
    messageTransmitterProgram.programId,
  );
  const tokenMinterAccount = findProgramAddress(
    "token_minter",
    tokenMessengerMinterProgram.programId,
  );
  const localToken = findProgramAddress(
    "local_token",
    tokenMessengerMinterProgram.programId,
    [solUsdcAddress],
  );
  const remoteTokenMessengerKey = findProgramAddress(
    "remote_token_messenger",
    tokenMessengerMinterProgram.programId,
    [remoteDomain],
  );
  const remoteTokenKey = new PublicKey(hexToBytes(remoteUsdcAddressHex));
  const tokenPair = findProgramAddress(
    "token_pair",
    tokenMessengerMinterProgram.programId,
    [remoteDomain, remoteTokenKey],
  );
  const custodyTokenAccount = findProgramAddress(
    "custody",
    tokenMessengerMinterProgram.programId,
    [solUsdcAddress],
  );
  const authorityPda = findProgramAddress(
    "message_transmitter_authority",
    messageTransmitterProgram.programId,
    [tokenMessengerMinterProgram.programId],
  ).publicKey;
  const tokenMessengerEventAuthority = findProgramAddress(
    "__event_authority",
    tokenMessengerMinterProgram.programId,
  );

  const usedNonces = await messageTransmitterProgram.methods
    .getNoncePda({
      nonce: new anchor.BN(nonce),
      sourceDomain: Number(remoteDomain),
    })
    .accounts({
      messageTransmitter: messageTransmitterAccount.publicKey,
    })
    .view();

  return {
    messageTransmitterAccount,
    tokenMessengerAccount,
    tokenMinterAccount,
    localToken,
    remoteTokenMessengerKey,
    remoteTokenKey,
    tokenPair,
    custodyTokenAccount,
    authorityPda,
    tokenMessengerEventAuthority,
    usedNonces,
  };
};

export const solanaAddressToHex = (solanaAddress: string): string =>
  hexlify(bs58.decode(solanaAddress));

export const evmAddressToSolana = (evmAddress: string): string =>
  bs58.encode(hexToBytes(evmAddress));

export const evmAddressToBytes32 = (address: string): string =>
  `0x000000000000000000000000${address.replace("0x", "")}`;

export const hexToBytes = (hex: string): Buffer =>
  Buffer.from(hex.replace("0x", ""), "hex");

// Convenience wrapper for PublicKey.findProgramAddressSync
export const findProgramAddress = (
  label: string,
  programId: PublicKey,
  extraSeeds?: (string | number[] | Buffer | PublicKey)[],
): FindProgramAddressResponse => {
  const seeds = [Buffer.from(anchor.utils.bytes.utf8.encode(label))];
  if (extraSeeds) {
    for (const extraSeed of extraSeeds) {
      if (typeof extraSeed === "string") {
        seeds.push(Buffer.from(anchor.utils.bytes.utf8.encode(extraSeed)));
      } else if (Array.isArray(extraSeed)) {
        seeds.push(Buffer.from(extraSeed as number[]));
      } else if (Buffer.isBuffer(extraSeed)) {
        seeds.push(Buffer.from(extraSeed));
      } else {
        seeds.push(Buffer.from(extraSeed.toBuffer()));
      }
    }
  }
  const res = PublicKey.findProgramAddressSync(seeds, programId);
  return { publicKey: res[0], bump: res[1] };
};

export const decodeEventNonceFromMessage = (messageHex: string): string => {
  const nonceIndex = 12;
  const nonceBytesLength = 8;
  const message = hexToBytes(messageHex);
  const eventNonceBytes = message.subarray(
    nonceIndex,
    nonceIndex + nonceBytesLength,
  );
  const eventNonceHex = hexlify(eventNonceBytes);
  return BigInt(eventNonceHex).toString();
};

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing environment variable: ${key}`);
  return val;
}

export async function getPayer<N extends Network, C extends Chain>(
  chain: ChainContext<N, C>,
): Promise<Signer<N, C>> {
  let signer: Signer;
  const platform = chain.platform.utils()._platform;

  switch (platform) {
    case "Solana":
      signer = await (
        await solana()
      ).getSigner(await chain.getRpc(), getEnv("SOLANA_PAYER_PRIVATE_KEY"));
      break;
    case "Evm":
      signer = await (
        await evm()
      ).getSigner(await chain.getRpc(), getEnv("EVM_PAYER_PRIVATE_KEY"));
      break;
    default:
      throw new Error("Unsupported platform: " + platform);
  }
  return signer as Signer<N, C>;
}
