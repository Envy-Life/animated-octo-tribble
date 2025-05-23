import { eq } from "drizzle-orm";
import { db } from "..";
import { clans, userClans, users } from "../db/schema";
import { MyContext } from "../helpers/grammy";

export const clansController = async (ctx: MyContext) => {
    try {
        if (ctx.chat?.type !== "private") {
            await ctx.reply("Please use this command in private chat.");
            return;
        }

        if (!ctx.from?.id) {
            await ctx.reply("Unable to identify user.");
            return;
        }

        const loadingMessage = await ctx.reply("Loading your clans...");

        // Get user's clan memberships with clan details
        const userClanMemberships = await db
            .select({
                clan: clans,
                membership: userClans,
            })
            .from(userClans)
            .innerJoin(clans, eq(userClans.clanId, clans.clanId))
            .where(eq(userClans.userId, ctx.from.id.toString()));

        if (userClanMemberships.length === 0) {
            await ctx.api.editMessageText(
                loadingMessage.chat.id,
                loadingMessage.message_id,
                "🏴 You're not a member of any clans yet.\n\n" +
                "Join a Telegram group where the bot is present to automatically become a clan member!"
            );
            return;
        }

        let message = "🏰 **Your Clans:**\n\n";

        for (const { clan, membership } of userClanMemberships) {
            const roleEmoji = membership.role === "administrator" ? "👑" : "👤";
            const joinedDate = membership.joinedAt?.toLocaleDateString() || "Unknown";

            message += `${roleEmoji} **${clan.clanName}**\n`;
            message += `├ Role: ${membership.role}\n`;
            message += `├ Members: ${clan.usersCount}\n`;
            message += `├ Type: ${clan.clanType}\n`;
            message += `├ Volume: $${clan.volume?.toLocaleString() || 0}\n`;
            message += `├ PnL: $${clan.pnl?.toLocaleString() || 0}\n`;
            message += `└ Joined: ${joinedDate}\n\n`;
        }

        message += `💡 *Clans are automatically created when the bot is added to groups.*`;

        await ctx.api.editMessageText(
            loadingMessage.chat.id,
            loadingMessage.message_id,
            message
        );

    } catch (error) {
        console.error("Error in clansController:", error);
        if (error instanceof Error) {
            await ctx.reply(`Error: ${error.message}`);
        } else {
            await ctx.reply("An unknown error occurred.");
        }
    }
};

export const clanStatsController = async (ctx: MyContext) => {
    try {
        if (!ctx.chat || (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup")) {
            await ctx.reply("This command can only be used in groups.");
            return;
        }

        const loadingMessage = await ctx.reply("Loading clan stats...");

        // Get clan for this group
        const clan = await db
            .select()
            .from(clans)
            .where(eq(clans.telegramGroupId, ctx.chat.id.toString()))
            .limit(1);

        if (clan.length === 0) {
            await ctx.api.editMessageText(
                loadingMessage.chat.id,
                loadingMessage.message_id,
                "❌ No clan found for this group. Make sure the bot has been properly added to create a clan."
            );
            return;
        }

        const clanData = clan[0];

        // Get recent member activity (you can enhance this with more stats)
        const totalMembers = await db
            .select()
            .from(userClans)
            .where(eq(userClans.clanId, clanData.clanId));

        let message = `🏰 **${clanData.clanName} Stats**\n\n`;
        message += `👥 Members: ${totalMembers.length}\n`;
        message += `📈 Total Volume: $${clanData.volume?.toLocaleString() || 0}\n`;
        message += `💰 Total PnL: $${clanData.pnl?.toLocaleString() || 0}\n`;
        message += `🏷️ Type: ${clanData.clanType}\n`;
        message += `📅 Created: ${clanData.createdAt?.toLocaleDateString() || "Unknown"}\n\n`;
        message += `💡 *Use /trade to contribute to clan volume and PnL!*`;

        await ctx.api.editMessageText(
            loadingMessage.chat.id,
            loadingMessage.message_id,
            message
        );

    } catch (error) {
        console.error("Error in clanStatsController:", error);
        if (error instanceof Error) {
            await ctx.reply(`Error: ${error.message}`);
        } else {
            await ctx.reply("An unknown error occurred.");
        }
    }
}; 