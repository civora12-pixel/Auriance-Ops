-- Three website sections: Women, Kids clothes and Kids accessories.
-- Inactive products leave the website (except Women, left as it is).
UPDATE `products` SET `shop_section` = NULL
WHERE `is_active` = 0 AND (`shop_section` IS NULL OR `shop_section` <> 'women');
--> statement-breakpoint
-- Kids accessories: bibs (بافتة), diaper alternative, hooded towel, pacifier strap
UPDATE `products` SET `shop_section` = 'kids_accessories'
WHERE `is_active` = 1 AND (`shop_section` IS NULL OR `shop_section` <> 'women') AND (
  `name` LIKE '%بافت%' OR `name` LIKE '%بافيت%' OR lower(`name`) LIKE '%bavet%' OR lower(`name`) LIKE '%bavit%'
  OR `name` LIKE '%بديل البامبرز%' OR `name` LIKE '%بديل بامبرز%' OR `name` LIKE '%بديل البمبرز%'
  OR `name` LIKE '%فوطة قشط%' OR `name` LIKE '%فوطه قشط%'
  OR `name` LIKE '%وصلة سلو%' OR `name` LIKE '%وصله سلو%'
);
--> statement-breakpoint
-- Every other active product outside Women: Kids clothes
UPDATE `products` SET `shop_section` = 'kids_clothes'
WHERE `is_active` = 1 AND (`shop_section` IS NULL OR `shop_section` NOT IN ('women', 'kids_accessories'));
