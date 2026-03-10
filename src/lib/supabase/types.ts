export type TaskStatus =
  | "pending"
  | "acknowledged"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "cancelled";

export type TaskPriority = "P0" | "P1" | "P2" | "P3";

export type EscalationLevel = "slack" | "whatsapp" | "phone" | "manager";

export type ActivityType =
  | "created"
  | "status_change"
  | "progress_update"
  | "assigned"
  | "reassigned"
  | "comment"
  | "tracker_ping"
  | "tracker_response"
  | "escalation"
  | "completed"
  | "due_date_changed";

export interface Employee {
  id: string;
  auth_id: string | null;
  name: string;
  nickname: string | null;
  email: string;
  avatar_url: string | null;
  slack_id: string | null;
  discord_id: string | null;
  phone: string | null;
  whatsapp: string | null;
  role: "developer" | "lead" | "manager";
  avg_variance_ratio: number;
  avg_response_minutes: number;
  tasks_completed: number;
  on_time_percentage: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  created_by_id: string | null;
  ai_estimate_hours: number | null;
  actual_hours: number | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  tracker_enabled: boolean;
  tracker_interval_minutes: number;
  current_escalation: EscalationLevel;
  last_ping_at: string | null;
  last_response_at: string | null;
  progress_percent: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  assignee?: Employee;
  subtasks?: Task[];
}

export interface TaskActivity {
  id: string;
  task_id: string;
  actor_id: string | null;
  activity_type: ActivityType;
  message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: Employee;
}

export interface TrackerQueue {
  id: string;
  task_id: string;
  next_check_at: string;
  escalation_level: EscalationLevel;
  attempts_at_current_level: number;
  is_active: boolean;
  created_at: string;
}

// AI Insights — persistent AI observations
export type InsightType = "risk_alert" | "rebalance_suggestion" | "pattern_observation" | "decomposition";
export type InsightStatus = "pending" | "acknowledged" | "dismissed";

export interface AIInsight {
  id: string;
  type: InsightType;
  task_id: string | null;
  employee_id: string | null;
  message: string;
  metadata: Record<string, unknown>;
  status: InsightStatus;
  created_at: string;
}

// AI Proposals — agent-suggested actions requiring approval
export type ProposalAction = "reassign" | "extend_deadline" | "escalate_priority" | "decompose" | "rebalance";
export type ProposalStatus = "pending" | "approved" | "rejected";

export interface AIProposal {
  id: string;
  agent_id: string;
  action_type: ProposalAction;
  target_task_id: string | null;
  proposed_changes: Record<string, unknown>;
  reasoning: string;
  status: ProposalStatus;
  created_at: string;
  resolved_at: string | null;
}

// Performance Snapshots — daily employee metric captures
export interface PerformanceSnapshot {
  id: string;
  employee_id: string;
  snapshot_date: string;
  tasks_completed: number;
  on_time_percentage: number;
  avg_variance_ratio: number;
  avg_response_minutes: number;
  active_task_count: number;
  created_at: string;
}

// Supabase generated database type (simplified)
export interface Database {
  public: {
    Tables: {
      employees: { Row: Employee; Insert: Partial<Employee> & { name: string; email: string }; Update: Partial<Employee> };
      tasks: { Row: Task; Insert: Partial<Task> & { title: string }; Update: Partial<Task> };
      task_activity: { Row: TaskActivity; Insert: Partial<TaskActivity> & { task_id: string; activity_type: ActivityType }; Update: Partial<TaskActivity> };
      tracker_queue: { Row: TrackerQueue; Insert: Partial<TrackerQueue> & { task_id: string; next_check_at: string }; Update: Partial<TrackerQueue> };
    };
  };
}
