-- Enable RLS on core tables (may already be enabled, safe to run)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;

-- Employees: authenticated users can read all, update their own
CREATE POLICY "Authenticated users can read employees"
  ON employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Employees can update own record"
  ON employees FOR UPDATE
  TO authenticated
  USING (auth_id = auth.uid());

CREATE POLICY "Service role full access on employees"
  ON employees FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tasks: authenticated users can read all, create, update
CREATE POLICY "Authenticated users can read tasks"
  ON tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create tasks"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access on tasks"
  ON tasks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Task activity: authenticated users can read all, create
CREATE POLICY "Authenticated users can read task_activity"
  ON task_activity FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create task_activity"
  ON task_activity FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role full access on task_activity"
  ON task_activity FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
