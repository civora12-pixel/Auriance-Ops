DROP INDEX `orders_shipment_unique`;--> statement-breakpoint
ALTER TABLE `orders` ADD `rerecorded_from_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_shipment_active_unique` ON `orders` (lower("shipment_number")) WHERE "orders"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX `orders_shipment_idx` ON `orders` (lower("shipment_number"));--> statement-breakpoint
CREATE TRIGGER `products_sku_not_variant_insert` BEFORE INSERT ON `products`
WHEN EXISTS (SELECT 1 FROM `product_variants` WHERE lower(`sku`) = lower(NEW.`sku`))
BEGIN SELECT RAISE(ABORT, 'SKU is already used by a variant'); END;--> statement-breakpoint
CREATE TRIGGER `products_sku_not_variant_update` BEFORE UPDATE OF `sku` ON `products`
WHEN EXISTS (SELECT 1 FROM `product_variants` WHERE lower(`sku`) = lower(NEW.`sku`))
BEGIN SELECT RAISE(ABORT, 'SKU is already used by a variant'); END;--> statement-breakpoint
CREATE TRIGGER `variants_sku_not_product_insert` BEFORE INSERT ON `product_variants`
WHEN EXISTS (SELECT 1 FROM `products` WHERE lower(`sku`) = lower(NEW.`sku`))
  OR EXISTS (SELECT 1 FROM `product_variants` WHERE lower(`sku`) = lower(NEW.`sku`))
BEGIN SELECT RAISE(ABORT, 'SKU is already used'); END;--> statement-breakpoint
CREATE TRIGGER `variants_sku_not_product_update` BEFORE UPDATE OF `sku` ON `product_variants`
WHEN EXISTS (SELECT 1 FROM `products` WHERE lower(`sku`) = lower(NEW.`sku`))
  OR EXISTS (SELECT 1 FROM `product_variants` WHERE lower(`sku`) = lower(NEW.`sku`) AND `id` <> NEW.`id`)
BEGIN SELECT RAISE(ABORT, 'SKU is already used'); END;
