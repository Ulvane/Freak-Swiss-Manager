ALTER TABLE `players` ADD `account_email` text;--> statement-breakpoint
CREATE INDEX `players_account_idx` ON `players` (`account_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_account_tournament_unique` ON `players` (`tournament_id`,`account_email`);--> statement-breakpoint
ALTER TABLE `tournaments` ADD `join_code` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `registration_open` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_join_code_unique` ON `tournaments` (`join_code`);