CREATE TABLE "clans" (
	"clan_id" serial PRIMARY KEY NOT NULL,
	"telegram_group_id" numeric NOT NULL,
	"clan_name" varchar(255) NOT NULL,
	"clan_type" varchar(50) NOT NULL,
	"users_count" integer DEFAULT 0,
	"volume" integer DEFAULT 0,
	"pnl" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "clans_telegram_group_id_unique" UNIQUE("telegram_group_id")
);
--> statement-breakpoint
CREATE TABLE "user_clans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" numeric NOT NULL,
	"clan_id" integer NOT NULL,
	"role" varchar(20) DEFAULT 'member',
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_clans" ADD CONSTRAINT "user_clans_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_clans" ADD CONSTRAINT "user_clans_clan_id_clans_clan_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("clan_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_clans_user_id" ON "user_clans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_clans_clan_id" ON "user_clans" USING btree ("clan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_in_clan" ON "user_clans" USING btree ("user_id","clan_id");