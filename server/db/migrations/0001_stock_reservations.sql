ALTER TABLE `inventory` ADD `reserved` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory` ADD `not_sellable_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hold stock for orders that are already open (new / on hold) but not fully shipped
UPDATE `inventory` SET `reserved` = coalesce((
	SELECT sum(li.`quantity` - li.`shipped_quantity`)
	FROM `order_line_items` li JOIN `orders` o ON o.`id` = li.`order_id`
	WHERE o.`status` IN ('new', 'on_hold')
		AND li.`product_id` = `inventory`.`product_id`
		AND coalesce(li.`variant_id`, '') = coalesce(`inventory`.`variant_id`, '')
		AND li.`quantity` > li.`shipped_quantity`
), 0);
--> statement-breakpoint
-- Existing not-sellable units start at the item's current average cost
UPDATE `inventory` SET `not_sellable_cost` = `avg_cost` WHERE `not_sellable` > 0;
