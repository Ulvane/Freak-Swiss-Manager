-- Add visibility column to tournaments table
ALTER TABLE tournaments ADD COLUMN visibility TEXT NOT NULL DEFAULT 'COMMUNITY';

-- Create index for visibility filtering
CREATE INDEX IF NOT EXISTS tournaments_visibility_idx ON tournaments(visibility);
