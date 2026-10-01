CREATE TABLE `stripe_accounts` (
	`seller_id` text PRIMARY KEY NOT NULL,
	`stripe_account_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_accounts_stripe_account_id_unique` ON `stripe_accounts` (`stripe_account_id`);