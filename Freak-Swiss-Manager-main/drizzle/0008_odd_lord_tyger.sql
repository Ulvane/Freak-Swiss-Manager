CREATE TABLE `guest_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`tournament_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_hint` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_tokens_hash_unique` ON `guest_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `guest_tokens_player_idx` ON `guest_tokens` (`player_id`);--> statement-breakpoint
CREATE INDEX `guest_tokens_tournament_idx` ON `guest_tokens` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `guest_tokens_expiry_idx` ON `guest_tokens` (`expires_at`);--> statement-breakpoint
ALTER TABLE `players` ADD `guest_token_hash` text;