import cryptoJS from "crypto-js";
import {
  Keypair,
  ParsedAccountData,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { config } from "dotenv";
import { log } from "console";
import base58 from "bs58";
config();

export const encrypt = (text: string) =>
  cryptoJS.AES.encrypt(text, process.env.SECURITY_TOKEN!).toString();

export const decrypt = (ciphertext: string, isCrypto?: boolean) => {
  const bytes = cryptoJS.AES.decrypt(ciphertext, process.env.SECURITY_TOKEN!);
  console.log(bytes);
  const originalText = bytes.toString(cryptoJS.enc.Hex);

  const a = base58.decode(originalText);
  log(a);

  if (isCrypto) {
    return Keypair.fromSecretKey(
      Uint8Array.from(
        Array.from<number>(originalText?.split(",").map(Number) as any),
      ),
    ).publicKey.toBase58();
  } else {
    return originalText;
  }
};

export const encryptWithAES = (text: string, key: string) => {
  let enc = cryptoJS.AES.encrypt(text, key).toString();
  return cryptoJS.enc.Base64.stringify(cryptoJS.enc.Utf8.parse(enc));
};

export const decryptWithAES = (ciphertext: string, key: string) => {
  try {
    // Parse base64-encoded ciphertext
    let decData = cryptoJS.enc.Base64.parse(ciphertext).toString(
      cryptoJS.enc.Utf8,
    );
    console.log("Decoded Data:", decData);

    // Decrypt the data using the key
    let bytes = cryptoJS.AES.decrypt(decData, key).toString(cryptoJS.enc.Utf8);
    console.log("Decrypted Bytes:", bytes);

    return bytes;
  } catch (error) {
    console.error("Error:", error);
    return null; // Handle the error gracefully
  }
};

export const getNumberDecimals = async (
  mintAddress: PublicKey,
): Promise<number> => {
  const connection = new Connection(process.env.HELIUS_URL!, "confirmed");
  const info = await connection.getParsedAccountInfo(mintAddress);
  const result = (info.value?.data as ParsedAccountData).parsed.info
    .decimals as number;
  return result;
};
