CREATE TABLE `anti_abuse_records` (
	`id` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`banned_account_email` text,
	`ip` text,
	`reason` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `anti_abuse_records_browser_hash_idx` ON `anti_abuse_records` (`browser_hash`);
--> statement-breakpoint
CREATE INDEX `anti_abuse_records_expires_at_idx` ON `anti_abuse_records` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `account_browser_links` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`browser_hash` text NOT NULL,
	`ip` text,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`email`) REFERENCES `user_accounts`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_browser_links_unique` ON `account_browser_links` (`email`, `browser_hash`);
--> statement-breakpoint
CREATE INDEX `account_browser_links_browser_hash_idx` ON `account_browser_links` (`browser_hash`);
--> statement-breakpoint
CREATE INDEX `account_browser_links_last_seen_idx` ON `account_browser_links` (`last_seen_at`);
--> statement-breakpoint
CREATE TABLE `visitor_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`ip` text,
	`user_agent` text,
	`method` text,
	`path` text,
	`referer` text,
	`country` text,
	`city` text,
	`region` text,
	`latitude` text,
	`longitude` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `idx_visitor_logs_ip` ON `visitor_logs` (`ip`);
--> statement-breakpoint
CREATE INDEX `idx_visitor_logs_created` ON `visitor_logs` (`created_at`);
