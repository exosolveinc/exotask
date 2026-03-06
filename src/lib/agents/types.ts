export type AgentStatus = "idle" | "running" | "error" | "disabled";

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  interval_minutes: number;
  enabled: boolean;
  last_run_at: string | null;
  last_result: AgentRunResult | null;
  status: AgentStatus;
}

export interface AgentRunResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface AgentRegistryState {
  agents: AgentConfig[];
}
