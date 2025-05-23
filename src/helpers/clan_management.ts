import { eq, and } from "drizzle-orm";
import { db } from "..";
import { clans, userClans, users } from "../db/schema";
import { MyContext } from "./grammy";

/**
 * Creates a new clan for a Telegram group
 */
export async function createClan(groupId: number, groupName: string, groupType: "group" | "supergroup") {
    try {
        // Check if clan already exists
        const existingClan = await db
            .select()
            .from(clans)
            .where(eq(clans.telegramGroupId, groupId.toString()))
            .limit(1);

        if (existingClan.length > 0) {
            console.log(`Clan already exists for group ${groupId}`);
            return existingClan[0];
        }

        // Create new clan
        const [newClan] = await db
            .insert(clans)
            .values({
                telegramGroupId: groupId.toString(),
                clanName: groupName,
                clanType: groupType === "supergroup" ? "public" : "private",
            })
            .returning();

        console.log(`Created new clan for group ${groupId}: ${groupName}`);
        return newClan;
    } catch (error) {
        console.error("Error creating clan:", error);
        throw error;
    }
}

/**
 * Adds all registered users from a Telegram group to the clan
 */
export async function addGroupMembersToClan(ctx: MyContext, clanId: number) {
    try {
        if (!ctx.chat || (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup")) {
            return;
        }

        // Get all chat members
        const chatMembers = await ctx.api.getChatAdministrators(ctx.chat.id);

        // Also try to get regular members if possible (this might be limited by Telegram API)
        // For now, we'll work with what we can get and add members as they interact

        for (const member of chatMembers) {
            if (member.user.is_bot) continue; // Skip bots

            // Check if user is registered
            const registeredUser = await db
                .select()
                .from(users)
                .where(eq(users.userId, member.user.id.toString()))
                .limit(1);

            if (registeredUser.length > 0) {
                await addUserToClan(member.user.id.toString(), clanId);
            }
        }
    } catch (error) {
        console.error("Error adding group members to clan:", error);
        // Don't throw here as this is not critical for clan creation
    }
}

/**
 * Adds a user to a clan
 */
export async function addUserToClan(userId: string, clanId: number, role: string = "member") {
    try {
        // Check if user is already in the clan
        const existingMembership = await db
            .select()
            .from(userClans)
            .where(and(
                eq(userClans.userId, userId),
                eq(userClans.clanId, clanId)
            ))
            .limit(1);

        if (existingMembership.length > 0) {
            console.log(`User ${userId} is already a member of clan ${clanId}`);
            return existingMembership[0];
        }

        // Add user to clan
        const [membership] = await db
            .insert(userClans)
            .values({
                userId,
                clanId,
                role,
            })
            .returning();

        // Update clan user count
        await updateClanUserCount(clanId);

        console.log(`Added user ${userId} to clan ${clanId} with role ${role}`);
        return membership;
    } catch (error) {
        console.error("Error adding user to clan:", error);
        throw error;
    }
}

/**
 * Updates the user count for a clan
 */
export async function updateClanUserCount(clanId: number) {
    try {
        const memberCount = await db
            .select()
            .from(userClans)
            .where(eq(userClans.clanId, clanId));

        await db
            .update(clans)
            .set({ usersCount: memberCount.length })
            .where(eq(clans.clanId, clanId));
    } catch (error) {
        console.error("Error updating clan user count:", error);
    }
}

/**
 * Adds a user to all clans they are part of based on their current group memberships
 */
export async function addUserToExistingClans(ctx: MyContext, userId: string) {
    try {
        // This is more complex as we need to check which groups the user is in
        // For now, we'll implement a basic version that can be enhanced later

        // When a user starts the bot, we can't easily get all their group memberships
        // This would typically be handled when they interact in groups or through other means
        console.log(`Checking existing clan memberships for user ${userId}`);

        // This could be enhanced by:
        // 1. Storing group interactions when users send messages
        // 2. Using webhook updates to track group memberships
        // 3. Having users manually join clans

    } catch (error) {
        console.error("Error adding user to existing clans:", error);
    }
}

/**
 * Handles when a user sends a message in a group - adds them to clan if they're registered
 */
export async function handleGroupMessage(ctx: MyContext) {
    try {
        if (!ctx.chat || (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup")) {
            return;
        }

        if (!ctx.from) return;

        // Check if user is registered
        const registeredUser = await db
            .select()
            .from(users)
            .where(eq(users.userId, ctx.from.id.toString()))
            .limit(1);

        if (registeredUser.length === 0) return; // User not registered

        // Check if clan exists for this group
        const clan = await db
            .select()
            .from(clans)
            .where(eq(clans.telegramGroupId, ctx.chat.id.toString()))
            .limit(1);

        if (clan.length === 0) return; // Clan doesn't exist

        // Add user to clan if not already a member
        await addUserToClan(ctx.from.id.toString(), clan[0].clanId);
    } catch (error) {
        console.error("Error handling group message for clan membership:", error);
    }
}

/**
 * Updates clan stats when a user makes a trade
 */
export async function updateClanStatsForTrade(userId: string, volume: number, pnl: number = 0) {
    try {
        // Get all clans the user belongs to
        const userClanMemberships = await db
            .select()
            .from(userClans)
            .where(eq(userClans.userId, userId));

        for (const membership of userClanMemberships) {
            // Update clan volume and PnL
            const currentClan = await db
                .select()
                .from(clans)
                .where(eq(clans.clanId, membership.clanId))
                .limit(1);

            if (currentClan.length > 0) {
                const updatedVolume = (currentClan[0].volume || 0) + volume;
                const updatedPnl = (currentClan[0].pnl || 0) + pnl;

                await db
                    .update(clans)
                    .set({
                        volume: updatedVolume,
                        pnl: updatedPnl,
                        updatedAt: new Date(),
                    })
                    .where(eq(clans.clanId, membership.clanId));

                console.log(`Updated clan ${membership.clanId} stats: volume +${volume}, pnl +${pnl}`);
            }
        }
    } catch (error) {
        console.error("Error updating clan stats for trade:", error);
        // Don't throw here as this shouldn't block trade execution
    }
} 