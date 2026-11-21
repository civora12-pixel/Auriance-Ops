CREATE TABLE `return_arrivals` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`quantity` integer NOT NULL,
	`free_before` integer NOT NULL,
	`at` text NOT NULL,
	`announced_at` text,
	`user_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `return_arrivals_announced_idx` ON `return_arrivals` (`announced_at`);