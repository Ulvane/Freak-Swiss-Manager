CREATE TABLE `player_round_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`player_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `player_round_statuses_tournament_idx` ON `player_round_statuses` (`tournament_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `player_round_statuses_player_round_unique` ON `player_round_statuses` (`tournament_id`,`player_id`,`round_number`);