-- Cloudflare Workers cannot verify PBKDF2 records above 100,000 iterations.
-- Remove only those unusable password records so the same email can register
-- again; user accounts, tournaments, roles, and results remain untouched.
DELETE FROM `auth_credentials`
WHERE `password_iterations` > 100000;
