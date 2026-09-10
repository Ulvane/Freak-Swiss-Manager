ALTER TABLE `anti_abuse_records` ADD `banned_player_id` text;
--> statement-breakpoint
CREATE TABLE `player_browser_links` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`browser_hash` text NOT NULL,
	`ip` text,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_browser_links_unique` ON `player_browser_links` (`player_id`,`browser_hash`);
--> statement-breakpoint
CREATE INDEX `player_browser_links_browser_hash_idx` ON `player_browser_links` (`browser_hash`);
--> statement-breakpoint
CREATE INDEX `player_browser_links_last_seen_idx` ON `player_browser_links` (`last_seen_at`);
--> statement-breakpoint
CREATE INDEX `idx_visitor_logs_ip_path_created` ON `visitor_logs` (`ip`,`path`,`created_at`);
