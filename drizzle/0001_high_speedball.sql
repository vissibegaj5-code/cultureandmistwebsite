CREATE INDEX `idx_listings_status_created` ON `listings` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_listings_seller_created` ON `listings` (`seller_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_seller_created` ON `orders` (`seller_id`,`created_at`);