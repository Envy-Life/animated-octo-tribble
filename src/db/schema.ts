import {
  pgTable,
  serial,
  bigint,
  varchar,
  timestamp,
  boolean,
  numeric,
  text,
  index,
  uniqueIndex,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";

// Users table to store Telegram user information
export const users = pgTable("users", {
  userId: numeric("user_id").primaryKey(), // Telegram user ID
  chatId: numeric("chat_id").notNull(), // Telegram private chat ID
  username: varchar("username", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  registrationDate: timestamp("registration_date").defaultNow(),
  lastActive: timestamp("last_active").defaultNow(),
  isActive: boolean("is_active").default(true),
});

// Clans table to store clan/tg group information
export const clans = pgTable("clans", {
  clanId: serial("clan_id").primaryKey(), // tg group ID
  clanName: varchar("clan_name", { length: 255 }).notNull(),
  clanType: varchar("clan_type", { length: 50 }).notNull(), // 'public', 'private'
  usersCount: integer("users_count").default(0),
  volume: integer("volume").default(0),
  pnl: integer("pnl").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations for users
export const usersRelations = relations(users, ({ many }) => ({
  wallets: many(userWallets),
  bridges: many(bridges),
  sessions: many(userSessions),
  memberships: many(userClans),
}));

export const userClans = pgTable(
  "user_clans",
  {
    id: serial("id").primaryKey(), // optional surrogate PK
    userId: numeric("user_id") // FK → users.user_id
      .notNull()
      .references(() => users.userId),
    clanId: integer("clan_id") // FK → clans.clan_id
      .notNull()
      .references(() => clans.clanId),
    role: varchar("role", { length: 20 }).default("member"),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (t) => [
    index("idx_user_clans_user_id").on(t.userId),
    index("idx_user_clans_clan_id").on(t.clanId),
    uniqueIndex("unique_user_in_clan").on(t.userId, t.clanId), // prevents duplicates
  ],
);

export const userClansRelations = relations(userClans, ({ one }) => ({
  user: one(users, {
    fields: [userClans.userId],
    references: [users.userId],
  }),
  clan: one(clans, {
    fields: [userClans.clanId],
    references: [clans.clanId],
  }),
}));

export const clansRelations = relations(clans, ({ many }) => ({
  memberships: many(userClans),
}));

// Table for storing wallet addresses across different chains
export const userWallets = pgTable(
  "user_wallets",
  {
    walletId: serial("wallet_id").primaryKey(),
    userId: numeric("user_id")
      .notNull()
      .references(() => users.userId),
    chainType: varchar("chain_type", { length: 50 }).notNull(), // 'evm', 'solana', etc.
    address: varchar("address", { length: 255 }).notNull(),
    private_key: varchar("private_key", { length: 255 }), // Store private key securely
    createdAt: timestamp("created_at").defaultNow(),
    lastUsed: timestamp("last_used"),
  },
  (table) => [
    index("idx_user_wallets_user_id").on(table.userId),
    index("idx_user_wallets_chain_type").on(table.chainType),
    index("idx_user_wallets_address").on(table.address),
    uniqueIndex("unique_user_chain_address").on(
      table.userId,
      table.chainType,
      table.address,
    ),
  ],
);

// Relations for userWallets
export const userWalletsRelations = relations(userWallets, ({ one }) => ({
  user: one(users, {
    fields: [userWallets.userId],
    references: [users.userId],
  }),
}));

// Table to store chain-specific information
export const chains = pgTable("chains", {
  chainId: varchar("chain_id", { length: 50 }).primaryKey(),
  chainType: varchar("chain_type", { length: 50 }).notNull(),
  chainName: varchar("chain_name", { length: 100 }).notNull(),
  rpcUrl: varchar("rpc_url", { length: 255 }),
  explorerUrl: varchar("explorer_url", { length: 255 }),
  isActive: boolean("is_active").default(true),
});

// Relations for chains
export const chainsRelations = relations(chains, ({ many }) => ({
  sourceBridges: many(bridges, { relationName: "sourceChain" }),
  destinationBridges: many(bridges, { relationName: "destinationChain" }),
}));

// Table to track all bridge operations
export const bridges = pgTable(
  "bridges",
  {
    bridgeId: serial("bridge_id").primaryKey(),
    userId: numeric("user_id")
      .notNull()
      .references(() => users.userId),
    sourceChainId: varchar("source_chain_id", { length: 50 })
      .notNull()
      .references(() => chains.chainId),
    destinationChainId: varchar("destination_chain_id", { length: 50 })
      .notNull()
      .references(() => chains.chainId),
    tokenSymbol: varchar("token_symbol", { length: 20 }).notNull(),
    amount: numeric("amount", { precision: 36, scale: 18 }).notNull(),
    sourceTxId: varchar("source_tx_id", { length: 255 }),
    destinationTxId: varchar("destination_tx_id", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("idx_bridges_user_id").on(table.userId),
    index("idx_bridges_status").on(table.status),
    index("idx_bridges_source_tx_id").on(table.sourceTxId),
    index("idx_bridges_destination_tx_id").on(table.destinationTxId),
  ],
);

// Relations for bridges
export const bridgesRelations = relations(bridges, ({ one }) => ({
  user: one(users, {
    fields: [bridges.userId],
    references: [users.userId],
  }),
  sourceChain: one(chains, {
    fields: [bridges.sourceChainId],
    references: [chains.chainId],
    relationName: "sourceChain",
  }),
  destinationChain: one(chains, {
    fields: [bridges.destinationChainId],
    references: [chains.chainId],
    relationName: "destinationChain",
  }),
}));

// Table to store session data (for multi-step operations in Telegram)
export const userSessions = pgTable("user_sessions", {
  sessionId: serial("session_id").primaryKey(),
  userId: numeric("user_id")
    .notNull()
    .references(() => users.userId),
  sessionType: varchar("session_type", { length: 50 }).notNull(),
  sessionData: jsonb("session_data"), // For JSONB, you would use a custom type
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

// Relations for userSessions
export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.userId],
  }),
}));

// Initial seed data for chains
export const seedChains = [
  {
    chainId: "arbitrum",
    chainType: "evm",
    chainName: "Arbitrum",
    isActive: true,
  },
  {
    chainId: "solana",
    chainType: "solana",
    chainName: "Solana",
    isActive: true,
  },
  {
    chainId: "hyperliquid",
    chainType: "hyperliquid",
    chainName: "Hyperliquid",
    isActive: true,
  },
];
