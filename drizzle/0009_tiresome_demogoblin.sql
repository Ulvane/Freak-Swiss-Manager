CREATE TABLE `player_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`tournament_id` text NOT NULL,
	`player_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `player_sessions_token_idx` ON `player_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `player_sessions_expiry_idx` ON `player_sessions` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `player_sessions_token_tournament_unique` ON `player_sessions` (`token_hash`,`tournament_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `player_sessions_player_unique` ON `player_sessions` (`player_id`);--> statement-breakpoint
ALTER TABLE `players` ADD `withdrawn_from_round` integer;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `visibility` text DEFAULT 'official' NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `archived_at` text;