CREATE TABLE `reminders_sent` (
	`key` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `journal_entries` ADD `due_day` text;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD `settled_at` integer;