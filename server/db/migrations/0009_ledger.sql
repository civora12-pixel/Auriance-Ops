CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`code` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`group_name` text NOT NULL,
	`system_key` text,
	`is_auto` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_code_unique` ON `accounts` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_system_key_unique` ON `accounts` (`system_key`);--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`number` integer NOT NULL,
	`date` text NOT NULL,
	`memo` text NOT NULL,
	`source` text NOT NULL,
	`source_type` text,
	`source_id` text,
	`created_by` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_number_unique` ON `journal_entries` (`number`);--> statement-breakpoint
CREATE INDEX `journal_entries_date_idx` ON `journal_entries` (`date`);--> statement-breakpoint
CREATE INDEX `journal_entries_source_idx` ON `journal_entries` (`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `journal_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`account_id` text NOT NULL,
	`debit` real DEFAULT 0 NOT NULL,
	`credit` real DEFAULT 0 NOT NULL,
	`memo` text,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `journal_lines_entry_idx` ON `journal_lines` (`entry_id`);--> statement-breakpoint
CREATE INDEX `journal_lines_account_idx` ON `journal_lines` (`account_id`);--> statement-breakpoint
-- Starting chart of accounts (agreed October 2026). Admins can rename and add accounts later.
INSERT INTO `accounts` (`id`, `created_at`, `code`, `name`, `type`, `group_name`, `system_key`, `is_auto`, `is_active`) VALUES
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 10001, 'Cash', 'asset', 'Cash & banks', 'cash', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 11001, 'Accounts Receivable', 'asset', 'Receivables', 'accounts_receivable', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 12001, 'Custody – Hazar', 'asset', 'Custodies', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 13001, 'Inventory', 'asset', 'Inventory', 'inventory', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 13002, 'Returns in transit', 'asset', 'Inventory', 'returns_in_transit', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 14001, 'QNB', 'asset', 'Cash & banks', 'qnb', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 14002, 'Vodafone Cash', 'asset', 'Cash & banks', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 15001, 'Prepaid marketing', 'asset', 'Prepaid', 'prepaid_marketing', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 15002, 'Prepaid inventory', 'asset', 'Prepaid', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 15003, 'Pack material', 'asset', 'Prepaid', 'pack_material', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 16001, 'Shelves', 'asset', 'Fixed assets', 'shelves', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 16002, 'Shelves – accumulated depreciation', 'asset', 'Fixed assets', 'accumulated_depreciation', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 17001, 'Permanent subscriptions', 'asset', 'Intangible assets', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 20001, 'Accounts Payable', 'liability', 'Payables', 'accounts_payable', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 21001, 'Credit card', 'liability', 'Credit card', 'credit_card', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 21002, 'Salaries payable', 'liability', 'Salaries', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 21003, 'Salary retention payable', 'liability', 'Salaries', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 21004, 'Compensation payable – Osama', 'liability', 'Partners', 'compensation_osama', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 21005, 'Compensation payable – Hazar', 'liability', 'Partners', 'compensation_hazar', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 21006, 'Loan from Osama', 'liability', 'Partners', 'loan_osama', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 21007, 'Partners payable', 'liability', 'Partners', 'partners_payable', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 30001, 'Capital – Osama', 'equity', 'Partners'' capital', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 30002, 'Capital – Hazar', 'equity', 'Partners'' capital', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 30003, 'Capital – Ahmed Abu Aisha', 'equity', 'Partners'' capital', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 30004, 'Capital – Omar Taher', 'equity', 'Partners'' capital', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 30005, 'Capital – Engy', 'equity', 'Partners'' capital', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 30006, 'Capital – Ahmed Walid', 'equity', 'Partners'' capital', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 30007, 'Capital – Ahmed AbdelAziz', 'equity', 'Partners'' capital', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 30008, 'Capital – Tant Hoda', 'equity', 'Partners'' capital', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 30009, 'Capital – Abo Ahmed Walid', 'equity', 'Partners'' capital', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 31001, 'Income summary', 'equity', 'Closing', 'income_summary', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 40001, 'Sales', 'revenue', 'Sales', 'sales', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 40002, 'Sales returns', 'revenue', 'Sales', 'sales_returns', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 40003, 'Collection rounding – gain', 'revenue', 'Other income', 'rounding_gain', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 40004, 'Inventory count gain', 'revenue', 'Other income', 'count_gain', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 50001, 'Cost of goods sold', 'expense', 'Costs', 'cogs', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 50002, 'Pack material', 'expense', 'Costs', 'pack_material_expense', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 50003, 'Marketing', 'expense', 'Costs', 'marketing', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 50004, 'Transfer fees', 'expense', 'Costs', 'transfer_fees', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 50005, 'Shipping fees', 'expense', 'Costs', 'shipping_fees', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 50006, 'Tips', 'expense', 'Costs', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 50007, 'Collection rounding – loss', 'expense', 'Costs', 'rounding_loss', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 50008, 'Lost in transit', 'expense', 'Costs', 'lost_in_transit', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 50009, 'Samples', 'expense', 'Costs', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 50010, 'Damaged write-off', 'expense', 'Costs', 'damaged_writeoff', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 50011, 'Inventory count loss', 'expense', 'Costs', 'count_loss', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 60001, 'Salaries', 'expense', 'Selling & admin', 'salaries', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 60002, 'Bank charges', 'expense', 'Selling & admin', 'bank_charges', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 60003, 'IT', 'expense', 'Selling & admin', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 60004, 'Refused-delivery shipping', 'expense', 'Selling & admin', 'refused_shipping', 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 60005, 'Bonuses', 'expense', 'Selling & admin', NULL, 0, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 60006, 'Depreciation', 'expense', 'Selling & admin', 'depreciation', 1, 1),
  (lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000, 60007, 'Unidentified difference', 'expense', 'Selling & admin', 'unidentified', 0, 1);