-- AI Insights: risk alerts, rebalance suggestions, pattern observations, decompositions
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('risk_alert', 'rebalance_suggestion', 'pattern_observation', 'decomposition')),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_insights_type ON ai_insights(type);
CREATE INDEX idx_ai_insights_status ON ai_insights(status);
CREATE INDEX idx_ai_insights_task_id ON ai_insights(task_id);
CREATE INDEX idx_ai_insights_created_at ON ai_insights(created_at DESC);

-- AI Proposals: actionable suggestions that require human approval
CREATE TABLE IF NOT EXISTS ai_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('reassign', 'extend_deadline', 'escalate_priority', 'decompose', 'rebalance')),
  target_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  proposed_changes JSONB NOT NULL DEFAULT '{}',
  reasoning TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_proposals_status ON ai_proposals(status);
CREATE INDEX idx_ai_proposals_agent_id ON ai_proposals(agent_id);
CREATE INDEX idx_ai_proposals_created_at ON ai_proposals(created_at DESC);

-- Performance Snapshots: daily per-employee metric captures for trend analysis
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  on_time_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_variance_ratio NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  avg_response_minutes NUMERIC(8,2) NOT NULL DEFAULT 0,
  active_task_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, snapshot_date)
);

CREATE INDEX idx_perf_snapshots_employee ON performance_snapshots(employee_id);
CREATE INDEX idx_perf_snapshots_date ON performance_snapshots(snapshot_date DESC);

-- Enable RLS (Row Level Security) - permissive for service role
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow full access via service role / anon for now (tighten in production)
CREATE POLICY "Allow all on ai_insights" ON ai_insights FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on ai_proposals" ON ai_proposals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on performance_snapshots" ON performance_snapshots FOR ALL USING (true) WITH CHECK (true);
