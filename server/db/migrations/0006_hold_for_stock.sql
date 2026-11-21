ALTER TABLE `orders` ADD `customer_phone_2` text;--> statement-breakpoint
-- Only New orders hold stock now; On hold orders wait for stock and hold nothing
UPDATE `inventory` SET `reserved` = coalesce((
	SELECT sum(li.`quantity` - li.`shipped_quantity`)
	FROM `order_line_items` li JOIN `orders` o ON o.`id` = li.`order_id`
	WHERE o.`status` = 'new'
		AND li.`is_swap_replacement` = 0
		AND li.`product_id` = `inventory`.`product_id`
		AND coalesce(li.`variant_id`, '') = coalesce(`inventory`.`variant_id`, '')
		AND li.`quantity` > li.`shipped_quantity`
), 0);
