ALTER TABLE "bridges" ALTER COLUMN "source_tx_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chat_id" numeric NOT NULL;