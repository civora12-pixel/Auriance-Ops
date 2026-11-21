CREATE TABLE `closings` (
	`period` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL,
	`locked_at` integer,
	`locked_by` text
);
--> statement-breakpoint
-- Opening balances agreed so far (31 October 2026), by account code; the rest is typed in the app
INSERT OR IGNORE INTO `closings` (`period`, `status`, `data`, `updated_at`) VALUES ('opening', 'draft', '{"asOf":"2026-10-31","balances":{"10001":0,"12001":0,"15002":0,"16001":5400,"16002":-270,"17001":15000,"20001":0,"21001":10000,"21002":0,"21003":666.66},"capitals":{"30001":27370.02,"30002":39027.47,"30003":14597.36,"30004":24940.19,"30005":3316.41,"30006":308.01,"30007":2726.82,"30008":876.17,"30009":17870.8},"extraReceivable":0,"resultMode":"split"}', CAST(strftime('%s','now') AS INTEGER) * 1000);
