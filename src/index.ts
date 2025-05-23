import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Bot, MemorySessionStorage, session } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { run, sequentialize } from "@grammyjs/runner";
import { conversations, createConversation } from "@grammyjs/conversations";
import {
  newTradeController,
  newTradeConversation,
} from "./controllers/new_trade";
import * as schema from "./db/schema";
import {
  MyContext,
  MyConversationContext,
  type MySessionData,
} from "./helpers/grammy";
import { startController } from "./controllers/start";
import { Helius } from "helius-sdk";
import { seedDB } from "./db/seed";
import { migrateDB } from "./db/seed";

const helius = new Helius(process.env.HELIUS_API_KEY!);

process.on("uncaughtException", (err, origin) => {
  console.error(err, origin);
});

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is unset");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is unset");

const db = drizzle(databaseUrl, {
  schema: schema,
});

const bot = new Bot<MyConversationContext>(token);

(async () => {
  await migrateDB();
  console.log("Migration completed");
  await seedDB();
  console.log("Seeding completed");

  const initialSession = (): MySessionData => ({
    selectedMarketName: undefined,
    selectedMarketMaxLeverage: undefined,
    leverage: undefined,
    tradeType: undefined,
    positionSide: undefined,
    quantity: undefined,
    limitPrice: undefined,
  });
  const sessionStorage = new MemorySessionStorage<MySessionData>();

  bot.api.config.use(autoRetry());

  bot.use(
    session({
      initial: initialSession,
      storage: sessionStorage,
    }),
  );

  bot.use(
    sequentialize((ctx) => {
      const chat = ctx.chat?.id.toString();
      const user = ctx.from?.id.toString();
      return [chat, user].filter((con) => con !== undefined) as string[];
    }),
  );

  bot.use(conversations());

  bot.use(createConversation(newTradeConversation, "new_trade"));

  bot.command("start", startController);

  bot.command("trade", newTradeController);

  await bot.api.setMyCommands([
    {
      command: "start",
      description: "Setup your account or view home",
    },
    {
      command: "trade",
      description: "Start a new trade",
    },
  ]);

  process.once("SIGINT", () => bot.stop());
  process.once("SIGTERM", () => bot.stop());

  const handle = run(bot);

  handle
    .task()
    ?.then(() => {
      console.log("Bot done processing!");
    })
    .catch((err) => {
      console.error("Bot run handle error:", err);
    });

  console.log("Bot is starting...");
})();

export { bot, db, helius };
