CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_tokens_user_idx` ON `auth_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `deletion_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_summary` text NOT NULL,
	`deleted_by` text NOT NULL,
	`deleted_at` text NOT NULL,
	`stock_effect` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deletion_logs_created_idx` ON `deletion_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`date` text NOT NULL,
	`category` text NOT NULL,
	`amount` real NOT NULL,
	`vendor` text,
	`description` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`date`);--> statement-breakpoint
CREATE TABLE `financial_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`order_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `financial_events_order_idx` ON `financial_events` (`order_id`);--> statement-breakpoint
CREATE INDEX `financial_events_date_idx` ON `financial_events` (`date`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`on_hand` integer DEFAULT 0 NOT NULL,
	`avg_cost` real DEFAULT 0 NOT NULL,
	`not_sellable` integer DEFAULT 0 NOT NULL,
	`low_stock_alerted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_item_unique` ON `inventory` (`product_id`, coalesce(`variant_id`, ''));--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`movement_number` integer NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`type` text NOT NULL,
	`restock_type` text,
	`quantity_change` integer NOT NULL,
	`date` text NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text,
	`supplier` text,
	`cost` real,
	`reason` text,
	`notes` text,
	`unit_cost` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movements_number_unique` ON `inventory_movements` (`movement_number`);--> statement-breakpoint
CREATE INDEX `movements_product_idx` ON `inventory_movements` (`product_id`,`variant_id`);--> statement-breakpoint
CREATE INDEX `movements_order_idx` ON `inventory_movements` (`order_id`);--> statement-breakpoint
CREATE INDEX `movements_date_idx` ON `inventory_movements` (`date`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link` text,
	`order_id` text,
	`read` integer DEFAULT false NOT NULL,
	`created_at_iso` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`read`);--> statement-breakpoint
CREATE TABLE `order_line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`quantity` integer NOT NULL,
	`unit_price` real NOT NULL,
	`subtotal` real NOT NULL,
	`shipped_quantity` integer DEFAULT 0 NOT NULL,
	`returned_quantity` integer DEFAULT 0 NOT NULL,
	`is_swap_replacement` integer DEFAULT false NOT NULL,
	`replaces_line_item_id` text,
	`product_name` text NOT NULL,
	`product_sku` text NOT NULL,
	`variant_name` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `line_items_order_idx` ON `order_line_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `line_items_product_idx` ON `order_line_items` (`product_id`,`variant_id`);--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`order_id` text NOT NULL,
	`status` text NOT NULL,
	`changed_by` text NOT NULL,
	`changed_at` text NOT NULL,
	`note` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `history_order_idx` ON `order_status_history` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`order_number` integer NOT NULL,
	`order_date` text NOT NULL,
	`customer` text NOT NULL,
	`customer_phone` text,
	`shipment_number` text NOT NULL,
	`rep_id` text NOT NULL,
	`status` text NOT NULL,
	`subtotal` real NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`offer_name` text,
	`total` real NOT NULL,
	`notes` text,
	`shipment_notes` text,
	`refunded_amount` real DEFAULT 0 NOT NULL,
	`swap_price_difference` real DEFAULT 0 NOT NULL,
	`has_manual_total` integer DEFAULT false NOT NULL,
	`original_total` real NOT NULL,
	`shipped_at` text,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`paid_at` text,
	`payment_method` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_shipment_unique` ON `orders` (lower("shipment_number"));--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_date_idx` ON `orders` (`order_date`);--> statement-breakpoint
CREATE INDEX `orders_shipped_at_idx` ON `orders` (`shipped_at`);--> statement-breakpoint
CREATE INDEX `orders_paid_at_idx` ON `orders` (`paid_at`);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`product_id` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`attributes` text,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `variants_product_idx` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `variants_sku_unique` ON `product_variants` (lower("sku"));--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`unit_price` real NOT NULL,
	`uom` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`image_url` text,
	`has_variants` integer DEFAULT false NOT NULL,
	`reorder_threshold` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (lower("sku"));--> statement-breakpoint
CREATE INDEX `products_active_idx` ON `products` (`is_active`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`elevated_until` integer,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`password_hash` text,
	`role` text NOT NULL,
	`permissions` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);