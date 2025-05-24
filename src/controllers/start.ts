import { eq } from "drizzle-orm";
import { db } from "..";
import { users, userWallets } from "../db/schema";
import { MyContext } from "../helpers/grammy";
import { initialiseUser } from "../scripts/init_user";
import { addUserToExistingClans } from "../helpers/clan_management";

export const startController = async (ctx: MyContext) => {
  try {
    const loadingMessage = await ctx.reply("Loading...");

    if (ctx.chat?.type !== "private") {
      await ctx.api.editMessageText(
        loadingMessage.chat.id,
        loadingMessage.message_id,
        "Please start this bot in private chat.",
      );
      return;
    }

    let user = await db
      .select()
      .from(users)
      .where(eq(users.userId, ctx.from?.id.toString()!))
      .leftJoin(userWallets, eq(users.userId, userWallets.userId))
      .execute();

    let isNewUser = false;
    if (user.length === 0) {
      await ctx.api.editMessageText(
        loadingMessage.chat.id,
        loadingMessage.message_id,
        "Initialising user...",
      );
      await initialiseUser(ctx);
      isNewUser = true;

      user = await db
        .select()
        .from(users)
        .where(eq(users.userId, ctx.from?.id.toString()!))
        .leftJoin(userWallets, eq(users.userId, userWallets.userId))
        .execute();
    }

    // Add user to existing clans (if they're new or if they want to refresh clan memberships)
    if (ctx.from?.id) {
      await addUserToExistingClans(ctx, ctx.from.id.toString());
    }

    const evmAddress = user[0]?.user_wallets?.address ?? "N/A";
    const solAddress = user[1]?.user_wallets?.address ?? "N/A";

    const welcomeMessage = isNewUser
      ? "🎉 Welcome! Your account has been created and you've been added to any relevant clans.\n\n"
      : "👋 Welcome back!\n\n";

    await ctx.api.editMessageText(
      loadingMessage.chat.id,
      loadingMessage.message_id,
      welcomeMessage +
        `🏦 **Your Wallets:**\n` +
        `EVM: \`${evmAddress}\`\n` +
        `Solana: \`${solAddress}\`\n\n` +
        `Use /trade to start trading!`,
    );
  } catch (error) {
    console.error("Error in startController:", error);
    if (error instanceof Error) {
      await ctx.reply(`Error: ${error.message}`);
    } else {
      await ctx.reply("An unknown error occurred.");
    }
  }
};
