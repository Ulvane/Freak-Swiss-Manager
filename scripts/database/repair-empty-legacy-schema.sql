-- One-time prerequisite ONLY for the abandoned two-table prototype schema.
-- Apply as one transaction/batch before the numbered Drizzle migrations.
-- Refuse if either prototype table has records; retain both original tables.
CREATE TABLE __freak_legacy_repair_guard (row_count INTEGER NOT NULL CHECK (row_count = 0));
INSERT INTO __freak_legacy_repair_guard SELECT COUNT(*) FROM tournaments;
INSERT INTO __freak_legacy_repair_guard SELECT COUNT(*) FROM auth_credentials;
-- Referencing these columns also rejects a non-prototype credential layout.
INSERT INTO __freak_legacy_repair_guard SELECT COUNT(credential_id) + COUNT(public_key) FROM auth_credentials;
ALTER TABLE tournaments RENAME TO legacy_empty_tournaments_20260907;
ALTER TABLE auth_credentials RENAME TO legacy_empty_auth_credentials_20260907;
DROP TABLE __freak_legacy_repair_guard;
