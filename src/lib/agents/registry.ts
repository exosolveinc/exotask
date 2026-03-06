import type { AgentConfig, AgentRunResult } from "./types";

type Listener = () => void;

const defaultAgents: AgentConfig[] = [
  {
    id: "update-checker",
    name: "Update Checker",
    description:
      "Pings employees on active tasks for progress updates. Escalates through Slack, WhatsApp, Phone, and Manager.",
    icon: "bot",
    interval_minutes: 5,
    enabled: true,
    last_run_at: null,
    last_result: null,
    status: "idle",
  },
  {
    id: "task-analyzer",
    name: "Task Analyzer",
    description:
      "Analyzes tasks using AI to identify bottlenecks, suggest re-prioritization, flag overdue work, and provide team insights.",
    icon: "brain",
    interval_minutes: 60,
    enabled: true,
    last_run_at: null,
    last_result: null,
    status: "idle",
  },
  {
    id: "deadline-guardian",
    name: "Deadline Guardian",
    description:
      "Monitors upcoming deadlines and sends proactive warnings 24h and 4h before due dates.",
    icon: "shield-alert",
    interval_minutes: 30,
    enabled: true,
    last_run_at: null,
    last_result: null,
    status: "idle",
  },
  {
    id: "daily-digest",
    name: "Daily Digest",
    description:
      "Generates a daily standup summary with completed work, blockers, overdue tasks, and action items.",
    icon: "brain",
    interval_minutes: 1440,
    enabled: true,
    last_run_at: null,
    last_result: null,
    status: "idle",
  },
];

class AgentRegistry {
  private agents: AgentConfig[] = [...defaultAgents];
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  getAgents(): AgentConfig[] {
    return this.agents;
  }

  getAgent(id: string): AgentConfig | undefined {
    return this.agents.find((a) => a.id === id);
  }

  updateAgent(id: string, updates: Partial<AgentConfig>) {
    this.agents = this.agents.map((a) =>
      a.id === id ? { ...a, ...updates } : a
    );
    this.notify();
  }

  setRunning(id: string) {
    this.updateAgent(id, { status: "running" });
  }

  setResult(id: string, result: AgentRunResult) {
    this.updateAgent(id, {
      status: result.success ? "idle" : "error",
      last_run_at: result.timestamp,
      last_result: result,
    });
  }

  toggleAgent(id: string) {
    const agent = this.getAgent(id);
    if (agent) {
      this.updateAgent(id, {
        enabled: !agent.enabled,
        status: !agent.enabled ? "idle" : "disabled",
      });
    }
  }

  async runAgent(id: string): Promise<AgentRunResult> {
    this.setRunning(id);

    try {
      const response = await fetch(`/api/agents/${id}`, { method: "POST" });
      const data = await response.json();

      const result: AgentRunResult = {
        success: response.ok,
        message: data.message || (response.ok ? "Completed" : "Failed"),
        data,
        timestamp: new Date().toISOString(),
      };

      this.setResult(id, result);
      return result;
    } catch (err) {
      const result: AgentRunResult = {
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      };
      this.setResult(id, result);
      return result;
    }
  }
}

export const agentRegistry = new AgentRegistry();
