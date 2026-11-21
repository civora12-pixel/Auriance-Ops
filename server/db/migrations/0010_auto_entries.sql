ALTER TABLE `inventory_movements` ADD `paid_from_account_id` text;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD `related_movement_id` text;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD `purchase_value_change` real;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD `stock_value_change` real;--> statement-breakpoint
ALTER TABLE `orders` ADD `paid_amount` real;--> statement-breakpoint
-- Automatic entries start on 1 November 2026; everything before is in the opening balances
INSERT OR IGNORE INTO `app_settings` (`key`, `value`) VALUES ('ledger_start_day', '2026-11-01');
