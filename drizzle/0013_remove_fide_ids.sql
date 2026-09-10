DROP TRIGGER IF EXISTS players_fide_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS players_fide_update;
--> statement-breakpoint
ALTER TABLE `players` DROP COLUMN `fide_id`;
