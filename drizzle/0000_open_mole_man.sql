CREATE TABLE `pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`round_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`board_number` integer NOT NULL,
	`white_player_id` text,
	`black_player_id` text,
	`result` text DEFAULT '*' NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`white_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`black_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pairings_tournament_idx` ON `pairings` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `pairings_round_idx` ON `pairings` (`round_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pairings_board_unique` ON `pairings` (`tournament_id`,`round_number`,`board_number`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`fide_id` text DEFAULT '' NOT NULL,
	`rating` integer DEFAULT 0 NOT NULL,
	`seed` integer NOT NULL,
	`withdrawn` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `players_tournament_idx` ON `players` (`tournament_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_seed_unique` ON `players` (`tournament_id`,`seed`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`number` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rounds_tournament_number_unique` ON `rounds` (`tournament_id`,`number`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`rounds` integer NOT NULL,
	`current_round` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tournaments_owner_idx` ON `tournaments` (`owner_email`);--> statement-breakpoint
CREATE INDEX `tournaments_created_idx` ON `tournaments` (`created_at`);