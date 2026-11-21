-- Delayed orders hold no stock: give back what the open (New) delayed orders were holding
UPDATE `inventory` SET `reserved` = max(0, `reserved` - coalesce((
  SELECT sum(li.`quantity` - li.`shipped_quantity`)
  FROM `order_line_items` li
  JOIN `orders` o ON o.`id` = li.`order_id`
  WHERE o.`status` = 'new'
    AND o.`ship_on` IS NOT NULL
    AND li.`is_swap_replacement` = 0
    AND li.`quantity` > li.`shipped_quantity`
    AND li.`product_id` = `inventory`.`product_id`
    AND li.`variant_id` IS `inventory`.`variant_id`
), 0));
--> statement-breakpoint
-- Delayed orders never wait On hold: they hold nothing and are New
UPDATE `orders` SET `status` = 'new' WHERE `status` = 'on_hold' AND `ship_on` IS NOT NULL;
