-- Migration: Add tournament visibility field
-- Purpose: Enable FEATURED/COMMUNITY/PRIVATE classification

ALTER TABLE tournaments ADD COLUMN visibility TEXT NOT NULL DEFAULT 'COMMUNITY';

CREATE INDEX tournaments_visibility_idx ON tournaments(visibility);