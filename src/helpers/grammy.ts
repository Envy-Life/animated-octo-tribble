import { Context, SessionFlavor } from 'grammy';
import { ConversationFlavor } from '@grammyjs/conversations';

// Define your session structure that will be available on ctx.session
export interface MySessionData {
    // Fields that might have been in Telegraf's BotWizardSession or needed for conversations
    selectedMarketName?: string;
    selectedMarketMaxLeverage?: number;
    leverage?: string;
    tradeType?: 'limit_order' | 'market_order';
    positionSide?: 'LONG' | 'SHORT';
    quantity?: string;
    limitPrice?: string;
    // Add any other fields your bot's global session might need
}

// The custom context type for your bot
// This is the single source of truth for what MyContext is.
// export type MyContext = Context & SessionFlavor<MySessionData> & ConversationFlavor;

type BaseContext = Context & SessionFlavor<MySessionData>;
export type MyConversationContext = ConversationFlavor<BaseContext>;
export type MyContext = BaseContext;

// Alias MySession to MySessionData if that's the intent for index.ts
export type MySession = MySessionData;
