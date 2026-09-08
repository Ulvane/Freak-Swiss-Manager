ALTER TABLE `players` ADD `guest_expires_at` text;--> statement-breakpoint
CREATE INDEX `players_guest_expiry_idx` ON `players` (`guest_expires_at`);