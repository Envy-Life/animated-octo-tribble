import { db } from "..";
import { Hyperliquid } from "hyperliquid";
import { userWallets } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { long, short } from "../scripts/trade";
import { ethers } from "ethers";
import { InlineKeyboard } from "grammy";
import { MyContext } from "../helpers/grammy";
import { Conversation } from "@grammyjs/conversations";

const hlClient = new Hyperliquid({
  enableWs: false,
});

export async function newTradeController(
  ctx: MyContext
) {
  await ctx.conversation.enter("new_trade");
}

// Define the conversation
export async function newTradeConversation(
  conversation: Conversation,
  ctx: MyContext
) {
  let selectedMarket: any | null = null;
  let leverage: string | null = null;
  let tradeType: "limit_order" | "market_order" | null = null;
  let positionSide: "LONG" | "SHORT" | null = null;
  let limitPrice: string | null = null;
  let quantity: string | null = null;

  // Step 1: Select market
  await ctx.reply(`Please type the market you want to trade`);
  const marketCtx = await conversation.waitFor("message:text");
  const marketInput = marketCtx.message.text.trim();

  if (marketInput.length < 3) {
    await ctx.reply(
      "Market name must be at least 3 letters long. Please try again."
    );
    return;
  }
  const markets = (await hlClient.info.perpetuals.getMetaAndAssetCtxs())[0]
    .universe;
  const match = markets.find((market) =>
    market.name.toLowerCase().startsWith(marketInput.toLowerCase())
  );

  if (!match) {
    await ctx.reply(
      "No matching market found, please try again with a different name."
    );
    return;
  }
  selectedMarket = match;
  await ctx.reply(`Selected market: ${selectedMarket.name}`);

  // Step 1.1: Select margin
  let maxLeverage = selectedMarket?.maxLeverage;
  const leverageKeyboard = new InlineKeyboard()
    .text("1x", "1x")
    .text("2x", "2x")
    .text("5x", "5x")
    .row()
    .text("10x", "10x")
    .text("15x", "15x")
    .text(maxLeverage + "x", maxLeverage + "x")
    .row()
    .text("Cancel", "cancel_trade");

  await ctx.reply(
    `Selected market: ${selectedMarket?.name}\n` +
    `Max leverage: ${maxLeverage}\n` +
    `Please select or type the leverage you want to use (e.g., 10 or 10x):\n`,
    { reply_markup: leverageKeyboard }
  );

  const leverageUpdate = await conversation.waitFor([
    "message:text",
    "callback_query:data",
  ]);

  if (leverageUpdate.callbackQuery?.data) {
    const cbData = leverageUpdate.callbackQuery.data;
    if (cbData === "cancel_trade") {
      await leverageUpdate.editMessageText("Trade process canceled.");
      return;
    } else if (cbData.endsWith("x")) {
      leverage = cbData.slice(0, -1);
      await leverageUpdate.editMessageText(
        "Leverage selected: " + leverage + "x"
      );
      await leverageUpdate.answerCallbackQuery();
    }
  } else if (leverageUpdate.message?.text) {
    let input = leverageUpdate.message.text.trim();
    if (input.toLowerCase().endsWith("x")) {
      input = input.slice(0, -1);
    }
    if (isNaN(Number(input)) || Number(input) <= 0 || Number(input) > maxLeverage) {
      await ctx.reply(
        `Invalid leverage. Must be a number between 1 and ${maxLeverage}. Please start over.`
      );
      return;
    }
    leverage = input;
    await ctx.reply(`Leverage selected: ${leverage}x`);
  } else {
    await ctx.reply("Invalid input for leverage. Please start over.");
    return;
  }

  if (!leverage) return; // Should have leverage by now

  // Step 2: Select trade type
  const tradeTypeKeyboard = new InlineKeyboard()
    .text("Limit Order", "limit_order")
    .text("Market Order", "market_order")
    .row()
    .text("Cancel", "cancel_trade");
  await ctx.reply(`Choose trade type:`, {
    reply_markup: tradeTypeKeyboard,
  });

  const tradeTypeUpdate = await conversation.waitFor("callback_query:data");
  const tradeTypeInput = tradeTypeUpdate.callbackQuery.data;

  if (tradeTypeInput === "cancel_trade") {
    await tradeTypeUpdate.editMessageText("Trade process canceled.");
    return;
  } else if (
    tradeTypeInput === "limit_order" ||
    tradeTypeInput === "market_order"
  ) {
    tradeType = tradeTypeInput;
    await tradeTypeUpdate.editMessageText(
      "Trade type selected: " +
      (tradeType === "limit_order" ? "Limit Order" : "Market Order")
    );
    await tradeTypeUpdate.answerCallbackQuery();
  } else {
    await ctx.reply("Invalid trade type selection. Please start over.");
    return;
  }

  // Step 3: Choose position side
  const positionSideKeyboard = new InlineKeyboard()
    .text("LONG 📈", "long")
    .text("SHORT 📉", "short")
    .row()
    .text("Cancel", "cancel_trade");
  await ctx.reply("Select position side:", {
    reply_markup: positionSideKeyboard,
  });

  const positionSideUpdate = await conversation.waitFor("callback_query:data");
  const positionSideInput = positionSideUpdate.callbackQuery.data;

  if (positionSideInput === "cancel_trade") {
    await positionSideUpdate.editMessageText("Trade process canceled.");
    return;
  } else if (positionSideInput === "long" || positionSideInput === "short") {
    positionSide = positionSideInput.toUpperCase() as "LONG" | "SHORT";
    await positionSideUpdate.editMessageText(
      "Position side selected: " + positionSide
    );
    await positionSideUpdate.answerCallbackQuery();
  } else {
    await ctx.reply("Invalid position side selection. Please start over.");
    return;
  }

  // Step 4 & 5: Limit Price and Quantity
  if (tradeType === "limit_order") {
    await ctx.reply("Enter the limit price:");
    const limitPriceCtx = await conversation.waitFor("message:text");
    const rawLimitPrice = limitPriceCtx.message.text.trim();
    if (isNaN(Number(rawLimitPrice)) || Number(rawLimitPrice) <= 0) {
      await ctx.reply("Invalid limit price. Must be a positive number. Please start over.");
      return;
    }
    limitPrice = rawLimitPrice;
    await ctx.reply(`Limit price set to: ${limitPrice}`);

    await ctx.reply("Enter the size (quantity):");
    const quantityCtx = await conversation.waitFor("message:text");
    const rawQuantity = quantityCtx.message.text.trim();
    if (isNaN(Number(rawQuantity)) || Number(rawQuantity) <= 0) {
      await ctx.reply("Invalid size. Must be a positive number. Please start over.");
      return;
    }
    quantity = rawQuantity;
    await ctx.reply(`Size set to: ${quantity}`);
  } else { // Market order
    await ctx.reply("Enter the size for Market order:");
    const quantityCtx = await conversation.waitFor("message:text");
    const rawQuantity = quantityCtx.message.text.trim();
    if (isNaN(Number(rawQuantity)) || Number(rawQuantity) <= 0) {
      await ctx.reply("Invalid size. Must be a positive number. Please start over.");
      return;
    }
    quantity = rawQuantity;
    await ctx.reply(`Size set to: ${quantity}`);
  }

  if (!quantity) {
    await ctx.reply("Size not set. Please start over.");
    return;
  }

  // Step 6: Confirmation
  let confirmationMsg =
    `Confirm your trade:\n\n` +
    `Market: ${selectedMarket?.name}\n` +
    `Leverage: ${leverage}x\n` +
    `Type: ${tradeType?.replace("_", " ")}\n` +
    `Side: ${positionSide}\n` +
    `Size: ${quantity}`;

  if (limitPrice) {
    confirmationMsg += `\nLimit Price: ${limitPrice}`;
  }

  const confirmationKeyboard = new InlineKeyboard()
    .text("✅ Confirm Order", "confirm_order")
    .row()
    .text("❌ Cancel", "cancel_order");

  await ctx.reply(confirmationMsg, { reply_markup: confirmationKeyboard });

  // Step 7: Handle confirmation
  const confirmationUpdate = await conversation.waitFor("callback_query:data");
  const confirmationInput = confirmationUpdate.callbackQuery.data;

  if (confirmationInput === "confirm_order") {
    await confirmationUpdate.editMessageText("Order confirmed! Processing...");
    await confirmationUpdate.answerCallbackQuery();

    // Call place_trade
    await place_trade(ctx, selectedMarket.name, leverage, tradeType, positionSide, quantity, limitPrice);

  } else if (confirmationInput === "cancel_order") {
    await confirmationUpdate.editMessageText("Order canceled.");
    await confirmationUpdate.answerCallbackQuery();
  } else {
    await ctx.reply("Invalid confirmation. Please start over.");
  }
}

async function place_trade(
  ctx: MyContext,
  marketName: string,
  leverage: string,
  tradeType: "limit_order" | "market_order" | null,
  positionSide: "LONG" | "SHORT" | null,
  quantity: string,
  limitPrice: string | null
) {
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
  });

  const evmWalletHl = ethers.Wallet.createRandom();
  const evmAddressHl = evmWalletHl.address;
  const evmPrivateKeyHl = evmWalletHl.privateKey;

  await sdk.ensureInitialized();
  console.log("SDK initialized for main wallet");

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
    await long(sdk, agentSDK, marketName, Number(leverage), Number(quantity));
  } else if (positionSide === "SHORT") {
    console.log("Placing short order");
    await short(sdk, agentSDK, marketName, Number(leverage), Number(quantity));
  }

  await ctx.reply(
    `Trade executed:\n` +
    `Market: ${marketName}\n` + // Use marketName parameter
    `Leverage: ${leverage}x\n` + // Add leverage parameter to reply
    `Type: ${tradeType}\n` +
    `Side: ${positionSide}\n` +
    `Size: ${quantity}\n` +
    (limitPrice ? `Limit Price: ${limitPrice}` : "")
  );
}

