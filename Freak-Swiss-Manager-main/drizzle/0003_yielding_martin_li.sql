CREATE TABLE `moderator_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`tournament_id` text,
	`created_by_email` text NOT NULL,
	`used_by_email` text,
	`used_at` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderator_tokens_hash_unique` ON `moderator_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `moderator_tokens_tournament_idx` ON `moderator_tokens` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `moderator_tokens_expiry_idx` ON `moderator_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `moderators` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `moderators_created_idx` ON `moderators` (`created_at`);--> statement-breakpoint
CREATE TABLE `tournament_moderators` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`moderator_email` text NOT NULL,
	`assigned_by_email` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tournament_moderators_tournament_idx` ON `tournament_moderators` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `tournament_moderators_email_idx` ON `tournament_moderators` (`moderator_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_moderators_unique` ON `tournament_moderators` (`tournament_id`,`moderator_email`);--> statement-breakpoint
CREATE TABLE `user_accounts` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_accounts_last_seen_idx` ON `user_accounts` (`last_seen_at`);--> statement-breakpoint
ALTER TABLE `players` ADD `checked_in` integer DEFAULT false NOT NULL;