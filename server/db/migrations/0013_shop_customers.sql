CREATE TABLE `customer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`customer_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `customer_sessions_customer_idx` ON `customer_sessions` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customer_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`customer_id` text NOT NULL,
	`kind` text NOT NULL,
	`email` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `customer_tokens_customer_idx` ON `customer_tokens` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`phone_2` text,
	`email` text,
	`email_verified_at` integer,
	`password_hash` text NOT NULL,
	`city` text,
	`address` text,
	`baby_age_months` real,
	`baby_age_day` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_unique` ON `customers` (`email`);--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_account_id` text;--> statement-breakpoint
CREATE INDEX `orders_customer_account_idx` ON `orders` (`customer_account_id`);--> statement-breakpoint
ALTER TABLE `products` ADD `shop_section` text;