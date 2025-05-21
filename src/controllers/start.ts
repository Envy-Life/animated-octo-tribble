import { eq } from "drizzle-orm";
import { db } from "..";
import { users, userWallets } from "../db/schema";
import { MyContext } from "../helpers/grammy";
import { initialiseUser } from "../scripts/init_user";

export const startController = async (ctx: MyContext) => {
    try {
        const messageId = await ctx.reply("Loading...");

        if (ctx.chat?.type !== "private") {
            await ctx.editMessageText(ctx.chat?.id, messageId, "Please start this bot in private chat.");
            return;
        }

        let user = await db.select().from(users).where(eq(users.userId, ctx.from?.id.toString()!)).leftJoin(userWallets, eq(users.userId, userWallets.userId)).execute();

        if (user.length === 0) {
            await ctx.editMessageText(ctx.chat?.id, messageId, "Initialising user...");
            await initialiseUser(ctx);

            user = await db.select().from(users).where(eq(users.userId, ctx.from?.id.toString()!)).leftJoin(userWallets, eq(users.userId, userWallets.userId)).execute();

        }

        await ctx.editMessageText(ctx.chat?.id, messageId, "evm: " + user[0].user_wallets?.address + "\n" +
            "solana: " + user[1].user_wallets?.address);
    } catch (error) {
        await ctx.reply(error.message);
    }
}