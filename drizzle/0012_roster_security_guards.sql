-- Enforce at the write boundary across all registration paths and concurrent
-- requests. Existing rosters are preserved, including historical duplicates.
CREATE TRIGGER players_capacity_insert
BEFORE INSERT ON players
WHEN (SELECT player_limit FROM tournaments WHERE id = NEW.tournament_id) IS NOT NULL
 AND (SELECT COUNT(*) FROM players WHERE tournament_id = NEW.tournament_id)
     >= (SELECT player_limit FROM tournaments WHERE id = NEW.tournament_id)
BEGIN
  SELECT RAISE(ABORT, 'roster_capacity_exceeded');
END;
--> statement-breakpoint
CREATE TRIGGER players_fide_insert
BEFORE INSERT ON players
WHEN NEW.fide_id <> '' AND EXISTS (
  SELECT 1 FROM players WHERE tournament_id = NEW.tournament_id AND fide_id = NEW.fide_id
)
BEGIN
  SELECT RAISE(ABORT, 'roster_fide_conflict');
END;
--> statement-breakpoint
CREATE TRIGGER players_fide_update
BEFORE UPDATE OF fide_id, tournament_id ON players
WHEN NEW.fide_id <> '' AND EXISTS (
  SELECT 1 FROM players WHERE tournament_id = NEW.tournament_id
    AND fide_id = NEW.fide_id AND id <> NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'roster_fide_conflict');
END;
