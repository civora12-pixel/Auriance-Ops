ALTER TABLE `orders` ADD `address` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `channel` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_fee` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `whatsapp_posted_at` text;