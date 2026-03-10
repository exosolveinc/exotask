-- Add auth_id column to link employees to Supabase Auth users
ALTER TABLE employees ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_auth_id ON employees(auth_id);
