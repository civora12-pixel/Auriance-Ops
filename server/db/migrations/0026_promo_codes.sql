CREATE TABLE `promo_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`value` real DEFAULT 0 NOT NULL,
	`max_discount` real,
	`min_order` real,
	`starts_at` text,
	`ends_at` text,
	`active` integer DEFAULT true NOT NULL,
	`max_uses` integer,
	`once_per_customer` integer DEFAULT true NOT NULL,
	`section` text,
	`batch` text,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_codes_code_unique` ON `promo_codes` (`code`);--> statement-breakpoint
CREATE INDEX `promo_codes_batch_idx` ON `promo_codes` (`batch`);--> statement-breakpoint
CREATE TABLE `promo_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`promo_id` text NOT NULL,
	`order_id` text NOT NULL,
	`phone` text NOT NULL,
	`discount` real NOT NULL,
	`free_shipping` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `promo_redemptions_promo_idx` ON `promo_redemptions` (`promo_id`,`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `promo_redemptions_order_unique` ON `promo_redemptions` (`order_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `promo_code` text;