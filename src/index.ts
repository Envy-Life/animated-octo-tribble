import { Telegraf, session, type Context, Scenes } from 'telegraf';
import express from 'express';
import bodyParser from 'body-parser';
import { hook_handler } from './hooks/hooks';
import 'dotenv/config';
import { long, short, close } from './scripts/trade';
import type { Update } from "telegraf/types";
import { newTradeScene } from './scenes/new_trade';
import { drizzle } from 'drizzle-orm/node-postgres';
import { seedDB, migrateDB } from './db/seed'; 
import * as schema from './db/schema';
import { users, userWallets } from './db/schema';
import { eq } from 'drizzle-orm';
import { initialiseUser } from './scripts/init_user';
import { Helius } from 'helius-sdk';

const helius = new Helius(process.env.HELIUS_API_KEY!);

process.on('uncaughtException', (err, origin) => {
  console.error(err, origin);
});

const db = drizzle(process.env.DATABASE_URL!, {
  schema: schema,
});

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

app.get('/ping', (req, res) => {
  res.send('Pong!');
})

if (!process.env.BOT_TOKEN) {
  console.error('Error: BOT_TOKEN is not set');
  process.exit(1);
}

const bot = new Telegraf<Scenes.WizardContext>(process.env.BOT_TOKEN);

bot.use(session());

interface BotWizardSession extends Scenes.WizardSessionData {
  authMethod?: string;
  privateKey?: string;
  walletAddress?: string;
  selectedMarket?: {
    name: string;
    szDecimals: number;
    maxLeverage: number;
    onlyIsolated?: boolean;
  };
  leverage?: string;
  tradeType?: string;
  positionSide?: string;
  quantity?: string;
  limitPrice?: string;
}

const stage = new Scenes.Stage([
  newTradeScene,
]);

bot.use(stage.middleware());

bot.command('trade', async (ctx) => {
  await ctx.scene.enter('NEW_TRADE_SCENE');
})

bot.command('home', async (ctx) => {
  let { message_id } = await ctx.reply("Loading home...");

  if (ctx.chat?.type !== "private") {
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      message_id,
      "",
      "Please start this bot in private chat."
    );
    return;
  }

  let user = await db.select().from(users).where(eq(users.userId, ctx.from?.id?.toString())).leftJoin(userWallets, eq(users.userId, userWallets.userId)).execute();
  if (user.length === 0) {
    // User not found, initialize user
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      message_id,
      "",
      "Initialising user..."
    );
    await initialiseUser(ctx);
    user = await db.select().from(users).where(eq(users.userId, ctx.from?.id?.toString())).leftJoin(schema.userWallets, eq(users.userId, userWallets.userId)).execute();
  }
  await ctx.telegram.editMessageText(
    ctx.chat?.id,
    message_id,
    "",
    "evm: " + user[0].user_wallets?.address + "\n" +
    "solana: " + user[1].user_wallets?.address
  );
})

// Register the /ping command
bot.command('ping', (ctx) => {
  console.log(ctx.message);
  
  ctx.reply('Pong!');
})

app.post('/webhook', hook_handler);

async function main() {
  await migrateDB();
  console.log('Migration completed');
  await seedDB();
  console.log('Seeding completed');

  // Set up webhook
  app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
  });

  // Start the bot
  bot.launch().then(() => {
    console.log('Bot is running!');
  });

}

main().catch(error => console.log(error))

export { BotWizardSession, db, helius, bot};