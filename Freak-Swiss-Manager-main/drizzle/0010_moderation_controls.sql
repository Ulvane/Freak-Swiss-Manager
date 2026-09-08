CREATE TABLE `moderator_token_targets` (
	`token_id` text PRIMARY KEY NOT NULL,
	`target_email` text NOT NULL,
	FOREIGN KEY (`token_id`) REFERENCES `moderator_tokens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_email`) REFERENCES `user_accounts`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `moderator_token_targets_email_idx` ON `moderator_token_targets` (`target_email`);
--> statement-breakpoint
CREATE TABLE `moderation_accounts` (
	`email` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`banned_at` text,
	`banned_by_email` text,
	`ban_reason` text,
	FOREIGN KEY (`email`) REFERENCES `user_accounts`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `moderation_accounts_status_idx` ON `moderation_accounts` (`status`);
--> statement-breakpoint
CREATE TABLE `moderation_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`target_email` text,
	`tournament_id` text,
	`detail` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `moderation_audit_log_created_idx` ON `moderation_audit_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `moderation_audit_log_target_idx` ON `moderation_audit_log` (`target_email`);
