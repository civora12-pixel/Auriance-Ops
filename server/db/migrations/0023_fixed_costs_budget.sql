-- The monthly fixed costs agreed on 7 Nov 2026: marketing 35,000, salaries 8,000,
-- subscriptions 1,315 (Claude $23 + domain ~$11 a year at EGP 55), other running
-- costs 2,000 (bank charges and the like), depreciation 90.
INSERT INTO `app_settings` (`key`, `value`) VALUES ('day_budget', '[{"id":"salaries","name":"Salaries","monthly":8000,"accountCode":60001},{"id":"marketing","name":"Marketing","monthly":35000,"accountCode":50003},{"id":"subscriptions","name":"Subscriptions","monthly":1315,"accountCode":60003},{"id":"other","name":"Other running costs","monthly":2000,"accountCode":60002},{"id":"depreciation","name":"Depreciation","monthly":90,"accountCode":60006}]')
ON CONFLICT(`key`) DO UPDATE SET `value` = excluded.`value`;
