-- Fix H4: ensure approved defaults to false and cannot be set by regular users via client

ALTER TABLE listings ALTER COLUMN approved SET DEFAULT false;
