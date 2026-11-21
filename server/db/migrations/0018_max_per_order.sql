ALTER TABLE `products` ADD `max_per_order` integer;--> statement-breakpoint
-- Heaters (دفاية) are limited: at most 2 of each per website order
UPDATE `products` SET `max_per_order` = 2 WHERE `name` LIKE 'دفاية%' OR `name` LIKE '%دفاية%';
