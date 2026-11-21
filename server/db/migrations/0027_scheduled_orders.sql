ALTER TABLE `orders` ADD `ship_on` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `schedule_confirmed_at` text;--> statement-breakpoint
CREATE INDEX `orders_ship_on_idx` ON `orders` (`ship_on`);