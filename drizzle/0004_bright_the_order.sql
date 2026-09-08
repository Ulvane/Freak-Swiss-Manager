ALTER TABLE `moderator_tokens` ADD `token_hint` text;--> statement-breakpoint
ALTER TABLE `moderator_tokens` ADD `revoked_at` text;--> statement-breakpoint
ALTER TABLE `moderator_tokens` ADD `revoked_by_email` text;--> statement-breakpoint
CREATE INDEX `moderator_tokens_created_idx` ON `moderator_tokens` (`created_at`);