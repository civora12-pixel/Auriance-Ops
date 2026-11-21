-- One-time start for the shop sections (only products not in a section yet):
-- leggings, shorts and bras go to the women's section; bibs (بافيته) and
-- towels (فوطة قشط) to Accessories. Everything else waits for the team.
UPDATE `products` SET `shop_section` = 'women'
WHERE `shop_section` IS NULL AND (
  `name` LIKE '%ليجن%' OR `name` LIKE '%ليجين%' OR `name` LIKE '%ليقن%'
  OR `name` LIKE '%شورت%'
  OR `name` LIKE '%سوفت برا%' OR `name` LIKE 'برا %' OR `name` = 'برا'
  OR lower(`name`) LIKE '%legging%' OR lower(`name`) LIKE '%shorts%' OR lower(`name`) LIKE '%bra %' OR lower(`name`) LIKE '% bra' OR lower(`name`) = 'bra'
);
--> statement-breakpoint
UPDATE `products` SET `shop_section` = 'accessories'
WHERE `shop_section` IS NULL AND (
  `name` LIKE '%بافيت%' OR `name` LIKE '%بافتة%' OR `name` LIKE '%فوطة قشط%' OR `name` LIKE '%فوطه قشط%'
);
