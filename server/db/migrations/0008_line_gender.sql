ALTER TABLE `order_line_items` ADD `gender` text;--> statement-breakpoint
ALTER TABLE `products` ADD `needs_gender` integer DEFAULT true NOT NULL;