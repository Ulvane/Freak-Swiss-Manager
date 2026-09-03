-- Migration: Add tournament visibility and guest player ownership tokens.
-- Existing tournaments default to COMMUNITY visibility. Guest tokens are
-- stored as SHA-256 hashes so an unauthenticated visitor can later prove
-- ownership of their own player entry without an account.

ALTER TABLE `tournaments` ADD `visibility` text DEFAULT 'COMMUNITY' NOT NULL;--> statement-breakpoint
CREATE INDEX `tournaments_visibility_idx` ON `tournaments` (`visibility`);--> statement-breakpoint
ALTER TABLE `players` ADD `guest_token_hash` text;--> statement-breakpoint
CREATE INDEX `players_guest_token_idx` ON `players` (`guest_token_hash`);
