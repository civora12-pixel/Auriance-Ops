CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`number` integer NOT NULL,
	`date` text NOT NULL,
	`account_id` text NOT NULL,
	`file_name` text,
	`rows` text NOT NULL,
	`net_amount` real NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settlements_number_unique` ON `settlements` (`number`);--> statement-breakpoint
ALTER TABLE `orders` ADD `settlement_id` text;