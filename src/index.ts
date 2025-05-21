import { Telegraf, session, type Context, Scenes } from 'telegraf';
import express from 'express';
import bodyParser from 'body-parser';
import { hook_handler } from './hooks/hooks';
import 'dotenv/config';
import { long, short, close } from './scripts/trade';
import type { Update } from "telegraf/types";
import { newTradeConversation, newTradeScene } from './controllers/new_trade';
import { drizzle } from 'drizzle-orm/node-postgres';
import { seedDB, migrateDB } from './db/seed';
import * as schema from './db/schema';
import { users, userWallets } from './db/schema';
import { eq } from 'drizzle-orm';
import { initialiseUser } from './scripts/init_user';
import { Helius } from 'helius-sdk';
import { Bot, MemorySessionStorage } from 'grammy';
import { MyContext, MySession } from './helpers/grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { run, sequentialize } from '@grammyjs/runner';
import { ConversationFlavor, conversations, createConversation } from '@grammyjs/conversations';
import { startController } from './controllers/start';
const helius = new Helius(process.env.HELIUS_API_KEY!);

process.on('uncaughtException', (err, origin) => {
  console.error(err, origin);
});

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is unset");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is unset");

const db = drizzle(databaseUrl, {
  schema: schema,
});



// const app = express();
// const PORT = 3000;

// app.use(bodyParser.json());

// app.get('/ping', (req, res) => {
//   res.send('Pong!');
// })

// if (!process.env.BOT_TOKEN) {
//   console.error('Error: BOT_TOKEN is not set');
//   process.exit(1);
// }

// const bot = new Telegraf<Scenes.WizardContext>(process.env.BOT_TOKEN);

// bot.use(session());

// interface BotWizardSession extends Scenes.WizardSessionData {
//   authMethod?: string;
//   privateKey?: string;
//   walletAddress?: string;
//   selectedMarket?: {
//     name: string;
//     szDecimals: number;
//     maxLeverage: number;
//     onlyIsolated?: boolean;
//   };
//   leverage?: string;
//   tradeType?: string;
//   positionSide?: string;
//   quantity?: string;
//   limitPrice?: string;
// }

// const stage = new Scenes.Stage([
//   newTradeScene,
// ]);

// bot.use(stage.middleware());

// bot.command('trade', async (ctx) => {
//   await ctx.scene.enter('NEW_TRADE_SCENE');
// })

// bot.command('home', async (ctx) => {
//   let { message_id } = await ctx.reply("Loading home...");

//   if (ctx.chat?.type !== "private") {
//     await ctx.telegram.editMessageText(
//       ctx.chat?.id,
//       message_id,
//       "",
//       "Please start this bot in private chat."
//     );
//     return;
//   }

//   let user = await db.select().from(users).where(eq(users.userId, ctx.from?.id?.toString())).leftJoin(userWallets, eq(users.userId, userWallets.userId)).execute();
//   if (user.length === 0) {
//     // User not found, initialize user
//     await ctx.telegram.editMessageText(
//       ctx.chat?.id,
//       message_id,
//       "",
//       "Initialising user..."
//     );
//     await initialiseUser(ctx);
//     user = await db.select().from(users).where(eq(users.userId, ctx.from?.id?.toString())).leftJoin(schema.userWallets, eq(users.userId, userWallets.userId)).execute();
//   }
//   await ctx.telegram.editMessageText(
//     ctx.chat?.id,
//     message_id,
//     "",
//     "evm: " + user[0].user_wallets?.address + "\n" +
//     "solana: " + user[1].user_wallets?.address
//   );
// })

// // Register the /ping command
// bot.command('ping', (ctx) => {
//   console.log(ctx.message);

//   ctx.reply('Pong!');
// })

// app.post('/webhook', hook_handler);

(async () => {
  // await migrateDB();
  // console.log('Migration completed');
  // await seedDB();
  // console.log('Seeding completed');

  const bot = new Bot<MyContext>(token);

  const initialSession: MySession = () => ({});
  const sessionStorage = new MemorySessionStorage();

  bot.api.config.use(autoRetry());

  bot.use(
    session({
      initial: initialSession,
      storage: sessionStorage,
    })
  );

  bot.use(
    sequentialize((ctx) => {
      const chat = ctx.chat?.id.toString();
      const user = ctx.from?.id.toString();
      return [chat, user].filter((con) => con !== undefined) as any;
    })
  );

  bot.use(conversations());

  bot.use(createConversation(newTradeConversation, "new_trade"))

  bot.command("start", startController);

  await bot.api.setMyCommands([
    {
      command: "start",
      description: "Setup your account"
    },
    {
      command: "trade",
      description: "Start a new trade"
    }
  ])



  process.once("SIGINT", () => bot.stop());
  process.once("SIGTERM", () => bot.stop());

  const handle = run(bot);

  handle.task()?.then(() => {
    console.log("Bot done processing!");
  });



  // // Set up webhook
  // app.listen(PORT, () => {
  //   console.log(`Server is listening on port ${PORT}`);
  // });

  // // Start the bot
  // bot.launch().then(() => {
  //   console.log('Bot is running!');
  // });

})();

// main().catch(error => console.log(error))

export { db, helius };