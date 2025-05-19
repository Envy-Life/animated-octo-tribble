import { Telegraf, Markup, Scenes, session } from "telegraf";
import { BotWizardSession, db } from "..";
import { Hyperliquid, Meta } from "hyperliquid";
import { users, userWallets } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { long, short } from "../scripts/trade";
import { ethers } from "ethers";

const hlClient = new Hyperliquid({
    enableWs: false,
});

const newTradeScene = new Scenes.WizardScene<
  Scenes.WizardContext<BotWizardSession>
>(
  "NEW_TRADE_SCENE",
  // Step 1: Select market
  async (ctx) => {
    await ctx.reply(`Please type the market you want to trade`);
    return ctx.wizard.next();
  },
  // Step 1.1: Select margin
  async (ctx) => {
    const markets = (await hlClient.info.perpetuals.getMetaAndAssetCtxs())[0]
      .universe;

    if (ctx.message && "text" in ctx.message) {
      const input = ctx.message.text.trim();
      if (input.length < 3) {
        await ctx.reply(
          "Market name must be at least 3 letters long. Please try again."
        );
        return;
      }
      // Check if any market starts with the provided text (case-insensitive)
      const match = markets.find((market) =>
        market.name.toLowerCase().startsWith(input.toLowerCase())
      );
      if (!match) {
        await ctx.reply(
          "No matching market found, please try again with a different name."
        );
        return;
      }
      // Save the matching market name and acknowledge selection
      ctx.scene.session.selectedMarket = match;
      await ctx.reply(`Selected market: ${match.name}`);
    }

    let maxLeverage = ctx.scene.session.selectedMarket?.maxLeverage;

    ctx.reply(
      `Selected market: ${ctx.scene.session.selectedMarket?.name}\n` +
        `Max leverage: ${maxLeverage}\n` +
        `Please select or type the leverage you want to use:\n`,
      // SHOW LEVERAGES IN ARITHMETIC PROGRESSION max leverage can be anything between 20 and 50, leverage should start at 1x
      Markup.inlineKeyboard([
        [
          Markup.button.callback("1x", "1x"),
          Markup.button.callback("2x", "2x"),
          Markup.button.callback("5x", "5x"),
        ],
        [
          Markup.button.callback("10x", "10x"),
          Markup.button.callback("15x", "15x"),
          Markup.button.callback(maxLeverage + "x", maxLeverage + "x"),
        ],
        [Markup.button.callback("Cancel", "cancel")],
      ])
    );

    return ctx.wizard.next();
  },
  // Step 2: Select trade type
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const input = (ctx.callbackQuery as any)["data"];
      if (input === "cancel") {
        ctx.editMessageText("Trade process canceled.");
        return ctx.scene.leave();
      } else if (input.endsWith("x")) {
        ctx.scene.session.leverage = input.slice(0, -1);
        ctx.editMessageText(
          "Leverage selected: " + ctx.scene.session.leverage + "x"
        );
        ctx.answerCbQuery(
          "Leverage selected: " + ctx.scene.session.leverage + "x"
        );
      }
    }

    if (ctx.message && "text" in ctx.message) {
      const input = ctx.message.text.trim().slice(0, -1);
      if (isNaN(Number(input))) {
        await ctx.reply(
          "Invalid input. Please enter a valid number for leverage."
        );
        return;
      }
      if (Number(input) < 0) {
        await ctx.reply("Invalid input. Leverage cannot be negative.");
        return;
      }
      if (
        ctx.scene.session.selectedMarket?.maxLeverage &&
        Number(input) > ctx.scene.session.selectedMarket?.maxLeverage
      ) {
        await ctx.reply(
          `Invalid input. Leverage cannot exceed ${ctx.scene.session.selectedMarket?.maxLeverage}.`
        );
        return;
      }
      ctx.scene.session.leverage = input;
      ctx.reply(`Leverage selected: ${ctx.scene.session.leverage}x`);
    }

    if (!ctx.scene.session.leverage) {
      await ctx.reply(
        "Invalid selection. Please choose a valid leverage option."
      );
      return;
    }

    // Step 2: Choose trade type
    await ctx.reply(
      `Choose trade type:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("Limit Order", "limit_order"),
          Markup.button.callback("Market Order", "market_order"),
        ],
        [Markup.button.callback("Cancel", "cancel")],
      ])
    );
    return ctx.wizard.next();
  },
  // Step 3: Choose position side
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const input = (ctx.callbackQuery as any)["data"];
      if (input === "limit_order") {
        ctx.scene.session.tradeType = "limit_order";
      } else if (input === "market_order") {
        ctx.scene.session.tradeType = "market_order";
      } else if (input === "cancel") {
        ctx.editMessageText("Trade process canceled.");
        return ctx.scene.leave();
      } else {
        await ctx.reply(
          'Invalid selection. Please choose either "Limit Order" or "Market Order".'
        );
        return;
      }
    }

    if (!ctx.scene.session.tradeType) {
      await ctx.reply(
        'Invalid selection. Please choose either "Limit Order" or "Market Order".'
      );
      return;
    }

    ctx.editMessageText(
      "Trade type selected: " + ctx.scene.session.tradeType == "limit_order"
        ? "Limit Order"
        : "Market Order"
    );

    ctx.answerCbQuery(
      "Trade type selected: " + ctx.scene.session.tradeType == "limit_order"
        ? "Limit Order"
        : "Market Order"
    );

    await ctx.reply(
      "Select position side:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("LONG 📈", "long"),
          Markup.button.callback("SHORT 📉", "short"),
        ],
        [Markup.button.callback("Cancel", "cancel")],
      ])
    );
    return ctx.wizard.next();
  },

  // Step 4: Choose Limit Price
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const input = (ctx.callbackQuery as any)["data"];
      if (input === "long") {
        ctx.scene.session.positionSide = "LONG";
      } else if (input === "short") {
        ctx.scene.session.positionSide = "SHORT";
      } else if (input === "cancel") {
        ctx.editMessageText("Trade process canceled.");
        return ctx.scene.leave();
      } else {
        await ctx.reply(
          'Invalid selection. Please choose either "LONG" or "SHORT".'
        );
        return;
      }
    }

    if (!ctx.scene.session.positionSide) {
      await ctx.reply(
        'Invalid selection. Please choose either "LONG" or "SHORT".'
      );
      return;
    }

    ctx.editMessageText(
      "Position side selected: " + ctx.scene.session.positionSide == "LONG"
        ? "LONG"
        : "SHORT"
    );

    ctx.answerCbQuery(
      "Position side selected: " + ctx.scene.session.positionSide == "LONG"
        ? "LONG"
        : "SHORT"
    );

    if (ctx.scene.session.tradeType === "limit_order") {
      await ctx.reply("Enter the limit price:");
      return ctx.wizard.next();
    } else {
      await ctx.reply("Enter the size for Market order:");
      return ctx.wizard.selectStep(6); // Go to confirmation step
    }
  },

  // Step 5: Choose quantity
  async (ctx) => {
    if (ctx.message && "text" in ctx.message) {
      const input = ctx.message.text.trim();
      if (ctx.scene.session.tradeType === "limit_order") {
        ctx.scene.session.limitPrice = input;
        await ctx.reply(`Limit price set to: ${input}`);
      }
    }

    if (ctx.scene.session.tradeType === "limit_order") {
      await ctx.reply("Enter the size:");
    }

    return ctx.wizard.next();
  },

  // Step 6: Confirmation
  async (ctx) => {
    if (ctx.message && "text" in ctx.message) {
      const input = ctx.message.text.trim();
      ctx.scene.session.quantity = input;
      await ctx.reply(`Size set to: ${input}`);
    }

    let confirmationMsg =
      `Confirm your trade:\n\n` +
      `Market: ${ctx.scene.session.selectedMarket?.name}\n` +
      `Type: ${ctx.scene.session.tradeType?.replace("_", " ")}\n` +
      `Side: ${ctx.scene.session.positionSide}\n` +
      `Size: ${ctx.scene.session.quantity}`;

    if (ctx.scene.session.limitPrice) {
      confirmationMsg += `\nLimit Price: ${ctx.scene.session.limitPrice}`;
    }

    await ctx.reply(
      confirmationMsg,
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Confirm Order", "confirm_order")],
        [Markup.button.callback("❌ Cancel", "cancel_order")],
      ])
    );
    return ctx.wizard.next();
  },
  // Step 7: Handle confirmation
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const input = (ctx.callbackQuery as any)["data"];
      if (input === "confirm_order") {
        // Handle order confirmation logic here
        await ctx.reply("Order confirmed!");
        console.log("Order confirmed:", ctx.scene.session);
      } else if (input === "cancel_order") {
        await ctx.reply("Order canceled.");
        console.log("Order canceled.");
      }
    }

    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

    // let { message_id } = await ctx.reply("Processing your order...");

    await place_trade(ctx);

    // await ctx.telegram.editMessageText(
    //   ctx.chat?.id,
    //   message_id,
    //   "",
    //   "Order processed."
    // );

    return ctx.scene.leave();
  }
);

async function place_trade(ctx: Scenes.WizardContext<BotWizardSession>) {
  const { selectedMarket, tradeType, positionSide, quantity, limitPrice } =
    ctx.scene.session;

  const userId = ctx.from?.id?.toString();
  if (!userId) {
    await ctx.reply("User ID not found.");
    return;
  }
  const user = await db
    .select()
    .from(userWallets)
    .where(and(eq(userWallets.userId, userId), eq(userWallets.chainType, "evm")))
    .execute();

  if (user.length === 0) {
    await ctx.reply("User not found in the database.");
    return;
  }

  console.log("User found:", user[0]);

  const sdk = new Hyperliquid({
    enableWs: false,
    privateKey: user[0].private_key ?? '',
    walletAddress: user[0].address,
  })

  const evmWalletHl = ethers.Wallet.createRandom();
  const evmAddressHl = evmWalletHl.address;
  const evmPrivateKeyHl = evmWalletHl.privateKey;

  await sdk.ensureInitialized();
  console.log("SDK initialized");

  console.log("Creating new agent");
  console.log("Agent address:", evmAddressHl);
  console.log("Agent private key:", evmPrivateKeyHl);

  try {
    await sdk.exchange.approveAgent({
      agentAddress: evmAddressHl,
      agentName: "pvp"
    })
  } catch (error) {
    console.error("Error approving agent:", error);
    await ctx.reply("Error approving agent.");
    return;
  }

  const agentSDK = new Hyperliquid({
    enableWs: false,
    privateKey: evmPrivateKeyHl,
    walletAddress: evmAddressHl,
  });

  if (!sdk || !agentSDK) {
    await ctx.reply("Error initializing Hyperliquid SDK.");
    return;
  }

  await agentSDK.ensureInitialized();
  console.log("Agent SDK initialized");

  if (positionSide === "LONG") {
    console.log("Placing long order");
    await long(sdk ,agentSDK, selectedMarket?.name ?? "", Number(ctx.scene.session.leverage), Number(quantity));
  } else if (positionSide === "SHORT") {
    console.log("Placing short order");
    await short(sdk, agentSDK, selectedMarket?.name ?? "", Number(ctx.scene.session.leverage), Number(quantity));
  }

  await ctx.reply(
    `Trade executed:\n` +
      `Market: ${selectedMarket?.name}\n` +
      `Type: ${tradeType}\n` +
      `Side: ${positionSide}\n` +
      `Size: ${quantity}\n` +
      (limitPrice ? `Limit Price: ${limitPrice}` : "")
  );

  
}

export { newTradeScene };
