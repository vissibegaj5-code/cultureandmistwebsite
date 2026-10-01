CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`seller_name` text NOT NULL,
	`seller_email` text NOT NULL,
	`title` text NOT NULL,
	`brand` text NOT NULL,
	`category` text NOT NULL,
	`condition` text NOT NULL,
	`description` text NOT NULL,
	`price_cents` integer NOT NULL,
	`image_key` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`buyer_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL,
	`payment_reference` text,
	`created_at` text NOT NULL
);
