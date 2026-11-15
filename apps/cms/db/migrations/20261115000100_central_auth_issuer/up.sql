ALTER TABLE users ADD COLUMN auth_issuer TEXT;
ALTER TABLE sessions ADD COLUMN auth_issuer TEXT;
