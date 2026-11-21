ALTER TABLE `journal_lines` ADD `partner_account_id` text REFERENCES accounts(id);--> statement-breakpoint
-- Existing withdrawals: the Partners payable line belongs to the partner whose capital the same entry reduced
UPDATE `journal_lines` SET `partner_account_id` = (
  SELECT cap.`account_id` FROM `journal_lines` cap
  JOIN `accounts` a ON a.`id` = cap.`account_id`
  WHERE cap.`entry_id` = `journal_lines`.`entry_id` AND a.`group_name` = 'Partners'' capital'
  LIMIT 1
)
WHERE `account_id` = (SELECT `id` FROM `accounts` WHERE `system_key` = 'partners_payable')
  AND (
    SELECT count(*) FROM `journal_lines` cap
    JOIN `accounts` a ON a.`id` = cap.`account_id`
    WHERE cap.`entry_id` = `journal_lines`.`entry_id` AND a.`group_name` = 'Partners'' capital'
  ) = 1;
--> statement-breakpoint
-- Name the partner on those lines
UPDATE `journal_lines` SET `memo` = 'Owed to ' || replace((SELECT `name` FROM `accounts` WHERE `id` = `journal_lines`.`partner_account_id`), 'Capital – ', '')
WHERE `partner_account_id` IS NOT NULL AND `memo` IS NULL;
