import { eq } from "drizzle-orm";
import { db } from "..";
import { users, userWallets } from "../db/schema";
import { MyContext } from "../helpers/grammy";
import { initialiseUser } from "../scripts/init_user";

export const startController = async (ctx: MyContext) => {
    try {
        const loadingMessage = await ctx.reply("Loading...");

        if (ctx.chat?.type !== "private") {
            await ctx.api.editMessageText(loadingMessage.chat.id, loadingMessage.message_id, "Please start this bot in private chat.");
            return;
        }

        let user = await db.select().from(users).where(eq(users.userId, ctx.from?.id.toString()!)).leftJoin(userWallets, eq(users.userId, userWallets.userId)).execute();

        if (user.length === 0) {
            await ctx.api.editMessageText(loadingMessage.chat.id, loadingMessage.message_id, "Initialising user...");
            await initialiseUser(ctx);

            user = await db.select().from(users).where(eq(users.userId, ctx.from?.id.toString()!)).leftJoin(userWallets, eq(users.userId, userWallets.userId)).execute();

        }
        const evmAddress = user[0]?.user_wallets?.address ?? "N/A";
        const solAddress = user[1]?.user_wallets?.address ?? "N/A";

        await ctx.api.editMessageText(loadingMessage.chat.id, loadingMessage.message_id, "evm: " + evmAddress + "\n" +
            "solana: " + solAddress);
    } catch (error) {
        console.error("Error in startController:", error);
        if (error instanceof Error) {
            await ctx.reply(`Error: ${error.message}`);
        } else {
            await ctx.reply("An unknown error occurred.");
        }
    }
}