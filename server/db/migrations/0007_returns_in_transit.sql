ALTER TABLE `inventory` ADD `in_transit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory` ADD `in_transit_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_line_items` ADD `in_transit_quantity` integer DEFAULT 0 NOT NULL;