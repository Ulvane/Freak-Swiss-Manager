ALTER TABLE `tournaments` ADD `visibility` text DEFAULT 'community' NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `featured` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `tournaments_visibility_idx` ON `tournaments` (`visibility`);