"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Brain,
  ShieldAlert,
  ArrowUp,
  Pause,
  Play,
  Phone,
  MessageSquare,
  Bell,
  Loader,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { cn, formatRelativeTime, displayName } from "@/lib/utils";
import { updateTask } from "@/lib/hooks/use-tasks";
import { agentRegistry } from "@/lib/agents/registry";
import type { AgentConfig } from "@/lib/agents/types";
import type { Task } from "@/lib/supabase/types";

interface TrackerViewProps {
  tasks: Task[];
  onRefetch: () => void;
}

const escalationLabels = {
  slack: "Slack DM",
  whatsapp: "WhatsApp",
  phone: "Phone Call",
  manager: "Manager Notified",
};

const agentIcons: Record<string, React.ElementType> = {
  bot: Bot,
  brain: Brain,
  "shield-alert": ShieldAlert,
};

function AgentCard({
  agent,
  onToggle,
  onRun,
}: {
  agent: AgentConfig;
  onToggle: () => void;
  onRun: () => void;
}) {
  const Icon = agentIcons[agent.icon] || Bot;
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";
  const isDisabled = !agent.enabled;

  return (
    <div
      className={cn(
        "bg-zinc-900/50 border rounded-xl p-4 transition-colors",
        isDisabled
          ? "border-zinc-800/30 opacity-50"
          : isError
          ? "border-red-500/20"
          : "border-zinc-800/50"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            isDisabled
              ? "bg-zinc-800 text-zinc-600"
              : agent.id === "update-checker"
              ? "bg-yellow-500/10 text-yellow-500"
              : agent.id === "task-analyzer"
              ? "bg-purple-500/10 text-purple-500"
              : "bg-red-500/10 text-red-500"
          )}
        >
          <Icon size={18} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-zinc-200">
              {agent.name}
            </h3>
            {isRunning && (
              <Loader size={12} className="text-blue-400 animate-spin" />
            )}
            {agent.last_result && !isRunning && (
              <>
                {agent.last_result.success ? (
                  <CheckCircle size={12} className="text-emerald-400" />
                ) : (
                  <XCircle size={12} className="text-red-400" />
                )}
              </>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
            {agent.description}
          </p>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
            <span>Every {agent.interval_minutes}m</span>
            {agent.last_run_at && (
              <span>Last: {formatRelativeTime(agent.last_run_at)}</span>
            )}
            {agent.last_result && (
              <span
                className={cn(
                  agent.last_result.success
                    ? "text-zinc-500"
                    : "text-red-400"
                )}
              >
                {agent.last_result.message}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onRun}
            disabled={isRunning || isDisabled}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors disabled:opacity-30"
            title="Run now"
          >
            <RefreshCw size={13} className={isRunning ? "animate-spin" : ""} />
          </button>
          <button
            onClick={onToggle}
            className={cn(
              "p-1.5 border rounded-lg transition-colors",
              agent.enabled
                ? "text-zinc-500 hover:text-zinc-300 border-zinc-800 hover:border-zinc-700"
                : "text-emerald-500 hover:text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40"
            )}
            title={agent.enabled ? "Pause agent" : "Enable agent"}
          >
            {agent.enabled ? <Pause size={13} /> : <Play size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TrackerView({ tasks, onRefetch }: TrackerViewProps) {
  const [agents, setAgents] = useState(agentRegistry.getAgents());

  useEffect(() => {
    const unsub = agentRegistry.subscribe(() => {
      setAgents([...agentRegistry.getAgents()]);
    });
    return () => { unsub(); };
  }, []);

  const handleToggle = useCallback((id: string) => {
    agentRegistry.toggleAgent(id);
  }, []);

  const handleRun = useCallback(
    async (id: string) => {
      await agentRegistry.runAgent(id);
      onRefetch();
    },
    [onRefetch]
  );

  const trackedTasks = tasks.filter(
    (t) =>
      t.tracker_enabled &&
      t.status !== "done" &&
      t.status !== "cancelled"
  );
  const pausedTasks = tasks.filter(
    (t) =>
      !t.tracker_enabled &&
      t.status !== "done" &&
      t.status !== "cancelled"
  );

  async function toggleTracker(taskId: string, enabled: boolean) {
    await updateTask(taskId, { tracker_enabled: enabled });
    onRefetch();
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-100 mb-1">
          Agent Registry
        </h2>
        <p className="text-sm text-zinc-500">
          AI agents that monitor, analyze, and manage your team&apos;s tasks
        </p>
      </div>

      {/* Agent Cards */}
      <div className="space-y-3">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onToggle={() => handleToggle(agent.id)}
            onRun={() => handleRun(agent.id)}
          />
        ))}
      </div>

      {/* Escalation flow */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
        <div className="text-xs text-zinc-500 mb-3">
          Escalation Flow (Update Checker)
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400">
            <MessageSquare size={13} />
            Slack
          </div>
          <ArrowUp size={14} className="text-zinc-600 rotate-90" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400">
            <MessageSquare size={13} />
            WhatsApp
          </div>
          <ArrowUp size={14} className="text-zinc-600 rotate-90" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg text-orange-400">
            <Phone size={13} />
            Phone
          </div>
          <ArrowUp size={14} className="text-zinc-600 rotate-90" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
            <Bell size={13} />
            Manager
          </div>
        </div>
        <div className="text-[11px] text-zinc-600 mt-2">
          15 min wait between each level. Resets on employee response.
        </div>
      </div>

      {/* Active trackers */}
      <div>
        <div className="text-xs text-zinc-500 mb-3 uppercase tracking-wider">
          Tracked Tasks ({trackedTasks.length})
        </div>
        <div className="space-y-2">
          {trackedTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 px-4 py-3 bg-zinc-900/50 border border-zinc-800/50 rounded-xl"
            >
              <Bot size={16} className="text-yellow-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate">
                  {task.title}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-zinc-500">
                  <span>every {task.tracker_interval_minutes}m</span>
                  {task.last_ping_at && (
                    <span>
                      pinged {formatRelativeTime(task.last_ping_at)}
                    </span>
                  )}
                  <span>
                    {escalationLabels[task.current_escalation]}
                  </span>
                </div>
              </div>
              {task.assignee && (
                <div className="text-xs text-zinc-500">
                  @{displayName(task.assignee).toLowerCase()}
                </div>
              )}
              <button
                onClick={() => toggleTracker(task.id, false)}
                className="px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 rounded transition-colors"
              >
                <Pause size={12} />
              </button>
            </div>
          ))}
          {trackedTasks.length === 0 && (
            <div className="text-sm text-zinc-600 py-4 text-center">
              No tracked tasks
            </div>
          )}
        </div>
      </div>

      {/* Paused */}
      {pausedTasks.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 mb-3 uppercase tracking-wider">
            Paused ({pausedTasks.length})
          </div>
          <div className="space-y-2">
            {pausedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 px-4 py-3 bg-zinc-900/30 border border-zinc-800/30 rounded-xl opacity-60"
              >
                <Bot size={16} className="text-zinc-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-400 truncate">
                    {task.title}
                  </div>
                </div>
                <button
                  onClick={() => toggleTracker(task.id, true)}
                  className="px-2 py-1 text-[11px] text-zinc-500 hover:text-emerald-400 border border-zinc-800 hover:border-emerald-500/30 rounded transition-colors"
                >
                  <Play size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
