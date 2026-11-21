-- Charity payable: the 3% charity from each closing is owed here until it's paid out.
-- Takes code 21008 (or the next free code among the 21xxx payables).
INSERT INTO `accounts` (`id`, `created_at`, `code`, `name`, `type`, `group_name`, `system_key`, `is_auto`, `is_active`)
SELECT
  lower(hex(randomblob(16))),
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM `accounts` WHERE `code` = 21008) THEN 21008
    ELSE (SELECT max(`code`) + 1 FROM `accounts` WHERE `code` BETWEEN 21001 AND 21998)
  END,
  'Charity payable',
  'liability',
  'Charity',
  'charity_payable',
  0,
  1
WHERE NOT EXISTS (SELECT 1 FROM `accounts` WHERE `system_key` = 'charity_payable');
