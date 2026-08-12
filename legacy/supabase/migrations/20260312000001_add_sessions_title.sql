-- Add title column to sessions (may already exist if added manually)
alter table sessions add column if not exists title text;
