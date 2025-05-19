CREATE TABLE "bridges" (
	"bridge_id" serial PRIMARY KEY NOT NULL,
	"user_id" numeric NOT NULL,
	"source_chain_id" varchar(50) NOT NULL,
	"destination_chain_id" varchar(50) NOT NULL,
	"token_symbol" varchar(20) NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"source_tx_id" varchar(255) NOT NULL,
	"destination_tx_id" varchar(255),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "chains" (
	"chain_id" varchar(50) PRIMARY KEY NOT NULL,
	"chain_type" varchar(50) NOT NULL,
	"chain_name" varchar(100) NOT NULL,
	"rpc_url" varchar(255),
	"explorer_url" varchar(255),
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"session_id" serial PRIMARY KEY NOT NULL,
	"user_id" numeric NOT NULL,
	"session_type" varchar(50) NOT NULL,
	"session_data" jsonb,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"wallet_id" serial PRIMARY KEY NOT NULL,
	"user_id" numeric NOT NULL,
	"chain_type" varchar(50) NOT NULL,
	"address" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"last_used" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" numeric PRIMARY KEY NOT NULL,
	"username" varchar(255),
	"first_name" varchar(255),
	"last_name" varchar(255),
	"registration_date" timestamp DEFAULT now(),
	"last_active" timestamp DEFAULT now(),
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
ALTER TABLE "bridges" ADD CONSTRAINT "bridges_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridges" ADD CONSTRAINT "bridges_source_chain_id_chains_chain_id_fk" FOREIGN KEY ("source_chain_id") REFERENCES "public"."chains"("chain_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridges" ADD CONSTRAINT "bridges_destination_chain_id_chains_chain_id_fk" FOREIGN KEY ("destination_chain_id") REFERENCES "public"."chains"("chain_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bridges_user_id" ON "bridges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_bridges_status" ON "bridges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_bridges_source_tx_id" ON "bridges" USING btree ("source_tx_id");--> statement-breakpoint
CREATE INDEX "idx_bridges_destination_tx_id" ON "bridges" USING btree ("destination_tx_id");--> statement-breakpoint
CREATE INDEX "idx_user_wallets_user_id" ON "user_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_wallets_chain_type" ON "user_wallets" USING btree ("chain_type");--> statement-breakpoint
CREATE INDEX "idx_user_wallets_address" ON "user_wallets" USING btree ("address");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_chain_address" ON "user_wallets" USING btree ("user_id","chain_type","address");