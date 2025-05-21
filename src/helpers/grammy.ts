import { Conversation, ConversationFlavor } from "@grammyjs/conversations";
import { Context, SessionFlavor } from "grammy";

export interface MySession {

}

export type MyContext = ConversationFlavor<Context> & SessionFlavor<MySession>;
