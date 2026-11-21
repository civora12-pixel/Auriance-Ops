ALTER TABLE `customers` ADD `shopping_for` text;--> statement-breakpoint
ALTER TABLE `products` ADD `audience` text DEFAULT 'both' NOT NULL;--> statement-breakpoint
-- Historical backfill for Civora Kids' empty-messenger rows; left as a no-op here since this is a fresh install
UPDATE `app_settings` SET `value` = json_set(`value`, '$.messenger', '')
WHERE `key` = 'shop_site' AND coalesce(json_extract(`value`, '$.messenger'), '') = '';
