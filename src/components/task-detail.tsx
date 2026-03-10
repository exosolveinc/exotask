"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X,
  Bot,
  Clock,
  CalendarDays,
  User,
  Plus,
  Check,
  Play,
  Brain,
  Loader,
  AlertTriangle,
  Sparkles,
  GitBranch,
} from "lucide-react";
import { cn, priorityConfig, statusConfig, formatRelativeTime, displayName } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { updateTask, updateTaskStatus, createTask } from "@/lib/hooks/use-tasks";
import { mockTasks, mockEmployees } from "@/lib/mock-data";
import type { Task, TaskActivity, TaskStatus } from "@/lib/supabase/types";

const isMock = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL === "";

interface TaskDetailProps {
  taskId: string;
  onClose: () => void;
  onRefetch: () => void;
}

const trackerIntervals = [
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
  { label: "4h", value: 240 },
];

const statusOptions: TaskStatus[] = [
  "pending",
  "acknowledged",
  "in_progress",
  "blocked",
  "review",
  "done",
];

interface DecompositionPlan {
  subtasks: Array<{
    title: string;
    estimate_hours: number;
    suggested_assignee_id: string | null;
    suggested_priority: string;
    dependency_index: number | null;
    reasoning: string;
  }>;
  total_estimate_hours: number;
  approach_summary: string;
}

function RiskBadge({ score }: { score: number }) {
  const color = score >= 70 ? "text-red-400 bg-red-500/15 border-red-500/30" :
    score >= 40 ? "text-yellow-400 bg-yellow-500/15 border-yellow-500/30" :
    "text-emerald-400 bg-emerald-500/15 border-emerald-500/30";
  const label = score >= 70 ? "High Risk" : score >= 40 ? "Medium Risk" : "Low Risk";

  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", color)}>
      {label} {score}%
    </span>
  );
}

export function TaskDetail({ taskId, onClose, onRefetch }: TaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [showAddSubtask, setShowAddSubtask] = useState(false);

  // AI Decomposition
  const [decomposing, setDecomposing] = useState(false);
  const [plan, setPlan] = useState<DecompositionPlan | null>(null);
  const [applyingPlan, setApplyingPlan] = useState(false);

  // Risk score
  const [riskScore, setRiskScore] = useState<number | null>(null);
  const [riskFactors, setRiskFactors] = useState<string[]>([]);

  const fetchTask = useCallback(async () => {
    if (isMock) {
      const allTasks = [...mockTasks, ...mockTasks.flatMap((t) => t.subtasks || [])];
      const found = allTasks.find((t) => t.id === taskId);
      if (found) setTask(found);
      const subs = mockTasks.find((t) => t.id === taskId)?.subtasks || [];
      setSubtasks(subs);
      setActivity([
        {
          id: "act-1",
          task_id: taskId,
          actor_id: "emp-1",
          activity_type: "progress_update" as const,
          message: "70% wrapping up tests",
          metadata: {},
          created_at: new Date(Date.now() - 9000000).toISOString(),
          actor: mockEmployees[0],
        },
        {
          id: "act-2",
          task_id: taskId,
          actor_id: null,
          activity_type: "tracker_ping" as const,
          message: "Tracker pinged via slack",
          metadata: {},
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: "act-3",
          task_id: taskId,
          actor_id: "emp-1",
          activity_type: "created" as const,
          message: "Created this task",
          metadata: {},
          created_at: new Date(Date.now() - 86400000).toISOString(),
          actor: mockEmployees[0],
        },
      ]);
      return;
    }

    const { data } = await supabase
      .from("tasks")
      .select("*, assignee:employees!assignee_id(*)")
      .eq("id", taskId)
      .single();
    if (data) setTask(data as Task);

    const { data: subs } = await supabase
      .from("tasks")
      .select("*, assignee:employees!assignee_id(*)")
      .eq("parent_id", taskId)
      .order("sort_order");
    if (subs) setSubtasks(subs as Task[]);

    const { data: acts } = await supabase
      .from("task_activity")
      .select("*, actor:employees!actor_id(*)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (acts) setActivity(acts as TaskActivity[]);
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Compute risk score client-side
  useEffect(() => {
    if (!task || task.status === "done" || task.status === "cancelled") {
      setRiskScore(null);
      return;
    }

    const factors: string[] = [];
    let points = 0;
    const now = Date.now();

    if (task.due_at) {
      const hoursLeft = (new Date(task.due_at).getTime() - now) / 3600000;
      if (hoursLeft < 0) { points += 30; factors.push(`Overdue by ${Math.abs(Math.round(hoursLeft))}h`); }
      else if (hoursLeft < 4) { points += 25; factors.push(`Due in ${Math.round(hoursLeft)}h`); }
      else if (hoursLeft < 24) { points += 15; factors.push("Due within 24h"); }
    }

    if (task.ai_estimate_hours && task.started_at) {
      const elapsed = (now - new Date(task.started_at).getTime()) / 3600000;
      const expected = Math.min((elapsed / task.ai_estimate_hours) * 100, 100);
      const gap = expected - task.progress_percent;
      if (gap > 30) { points += 20; factors.push(`${Math.round(gap)}% behind expected`); }
      else if (gap > 15) { points += 10; }
    }

    if (task.status === "blocked") { points += 15; factors.push("Blocked"); }
    if (task.priority === "P0") points += 10;
    else if (task.priority === "P1") points += 5;

    const score = Math.min(Math.round((1 / (1 + Math.exp(-(points - 25) / 12))) * 100), 100);
    setRiskScore(score);
    setRiskFactors(factors);
  }, [task]);

  if (!task) {
    return (
      <div className="w-96 border-l border-zinc-800/50 bg-zinc-950 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-zinc-800 rounded w-3/4" />
          <div className="h-3 bg-zinc-800 rounded w-1/2" />
        </div>
      </div>
    );
  }

  const prio = priorityConfig[task.priority];
  const status = statusConfig[task.status];
  const assignee = task.assignee;
  const isOverdue = task.due_at && new Date(task.due_at) < new Date() && task.status !== "done";
  const aiEstimate = task.ai_estimate_hours;
  const actual = task.actual_hours;
  const variance = aiEstimate && actual ? (actual / aiEstimate).toFixed(2) : null;
  const calibratedEstimate = aiEstimate && assignee
    ? Math.round(aiEstimate * assignee.avg_variance_ratio * 10) / 10
    : null;

  async function handleStatusChange(newStatus: TaskStatus) {
    await updateTaskStatus(taskId, newStatus);
    fetchTask();
    onRefetch();
  }

  async function handleTrackerInterval(minutes: number) {
    await updateTask(taskId, { tracker_interval_minutes: minutes });
    fetchTask();
  }

  async function handleToggleTracker() {
    await updateTask(taskId, { tracker_enabled: !task!.tracker_enabled });
    fetchTask();
  }

  async function handleAddSubtask() {
    if (!newSubtask.trim() || !task) return;
    await createTask({ title: newSubtask.trim(), parent_id: taskId, assignee_id: task.assignee_id || undefined });
    setNewSubtask("");
    setShowAddSubtask(false);
    fetchTask();
    onRefetch();
  }

  async function handleDecompose() {
    if (!task) return;
    setDecomposing(true);
    try {
      const res = await fetch("/api/ai/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, title: task.title, description: task.description }),
      });
      const data = await res.json();
      if (res.ok && data.subtasks) setPlan(data);
    } catch { /* silent */ } finally { setDecomposing(false); }
  }

  async function handleApplyPlan() {
    if (!plan || !task) return;
    setApplyingPlan(true);
    try {
      for (const sub of plan.subtasks) {
        await createTask({
          title: sub.title,
          parent_id: task.id,
          assignee_id: sub.suggested_assignee_id || task.assignee_id || undefined,
          priority: sub.suggested_priority,
        });
      }
      setPlan(null);
      fetchTask();
      onRefetch();
    } catch { /* silent */ } finally { setApplyingPlan(false); }
  }

  return (
    <div className="w-96 border-l border-zinc-800/50 bg-zinc-950 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800/50 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-zinc-100 leading-snug">{task.title}</h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border", prio.bg)}>{task.priority}</span>
            <span className={cn("text-xs", status.color)}>{status.label}</span>
            {riskScore !== null && <RiskBadge score={riskScore} />}
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1">
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Risk factors */}
        {riskFactors.length > 0 && riskScore !== null && riskScore >= 40 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
              <AlertTriangle size={12} /> Risk Factors
            </div>
            {riskFactors.map((f, i) => (
              <div key={i} className="text-[11px] text-red-300/70">• {f}</div>
            ))}
          </div>
        )}

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">Progress</span>
            <span className="text-xs text-zinc-400 tabular-nums">{task.progress_percent}%</span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", task.progress_percent === 100 ? "bg-emerald-500" : "bg-blue-500")}
              style={{ width: `${task.progress_percent}%` }}
            />
          </div>
        </div>

        {/* Meta */}
        <div className="space-y-2.5">
          {assignee && (
            <div className="flex items-center gap-2.5 text-sm">
              <User size={14} className="text-zinc-600" />
              <span className="text-zinc-400">{displayName(assignee)}</span>
            </div>
          )}
          {task.due_at && (
            <div className="flex items-center gap-2.5 text-sm">
              <CalendarDays size={14} className={isOverdue ? "text-red-400" : "text-zinc-600"} />
              <span className={isOverdue ? "text-red-400" : "text-zinc-400"}>
                {new Date(task.due_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                {isOverdue && " (overdue)"}
              </span>
            </div>
          )}
          {aiEstimate && (
            <div className="flex items-center gap-2.5 text-sm">
              <Clock size={14} className="text-zinc-600" />
              <span className="text-zinc-400">
                AI est: {aiEstimate}h
                {calibratedEstimate && calibratedEstimate !== aiEstimate && (
                  <span className="text-purple-400 ml-1">(calibrated: {calibratedEstimate}h)</span>
                )}
                {actual && (
                  <>
                    {" / "}Actual: {actual}h
                    <span className={cn("ml-1 text-xs", Number(variance) > 1.3 ? "text-red-400" : Number(variance) < 0.8 ? "text-emerald-400" : "text-zinc-500")}>
                      ({variance}x)
                    </span>
                  </>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Status */}
        <div>
          <span className="text-xs text-zinc-500 mb-2 block">Status</span>
          <div className="flex flex-wrap gap-1.5">
            {statusOptions.map((s) => (
              <button key={s} onClick={() => handleStatusChange(s)} className={cn("px-2.5 py-1 text-xs rounded-md border transition-colors", task.status === s ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300")}>
                {statusConfig[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Tracker */}
        <div className="bg-zinc-900/50 rounded-lg border border-zinc-800/50 p-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Bot size={14} className="text-yellow-500" /> Tracker
            </div>
            <button onClick={handleToggleTracker} className={cn("px-2 py-0.5 text-[10px] rounded border transition-colors", task.tracker_enabled ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-zinc-800 border-zinc-700 text-zinc-500")}>
              {task.tracker_enabled ? "Active" : "Paused"}
            </button>
          </div>
          <div className="flex gap-1.5">
            {trackerIntervals.map((int) => (
              <button key={int.value} onClick={() => handleTrackerInterval(int.value)} className={cn("px-2 py-1 text-[11px] rounded border transition-colors", task.tracker_interval_minutes === int.value ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "border-zinc-800 text-zinc-500 hover:border-zinc-700")}>
                {int.label}
              </button>
            ))}
          </div>
          {task.last_ping_at && (
            <div className="text-[11px] text-zinc-600 mt-2">
              Last ping: {formatRelativeTime(task.last_ping_at)}
              {task.last_response_at && <span className="text-emerald-600"> — responded</span>}
            </div>
          )}
        </div>

        {/* AI Decomposition */}
        {!task.parent_id && (
          <div className="bg-zinc-900/50 rounded-lg border border-zinc-800/50 p-3">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Brain size={14} className="text-purple-400" /> AI Decomposition
              </div>
              <button onClick={handleDecompose} disabled={decomposing} className="px-2 py-0.5 text-[10px] rounded border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors disabled:opacity-50">
                {decomposing ? <span className="flex items-center gap-1"><Loader size={10} className="animate-spin" /> Analyzing...</span> : "Generate Plan"}
              </button>
            </div>
            {plan && (
              <div className="space-y-2 mt-2">
                <p className="text-[11px] text-zinc-500 leading-relaxed">{plan.approach_summary}</p>
                <div className="space-y-1">
                  {plan.subtasks.map((sub, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] px-2 py-1.5 rounded bg-zinc-800/50">
                      <GitBranch size={10} className="text-purple-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-zinc-300">{sub.title}</div>
                        <div className="text-zinc-600 flex gap-2 mt-0.5">
                          <span>{sub.suggested_priority}</span>
                          <span>~{sub.estimate_hours}h</span>
                          {sub.dependency_index !== null && <span>depends on #{sub.dependency_index + 1}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
                  <span className="text-[10px] text-zinc-600">{plan.subtasks.length} subtasks · ~{plan.total_estimate_hours}h total</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => setPlan(null)} className="px-2 py-0.5 text-[10px] rounded border border-zinc-700 text-zinc-500 hover:text-zinc-300">Dismiss</button>
                    <button onClick={handleApplyPlan} disabled={applyingPlan} className="px-2 py-0.5 text-[10px] rounded bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 disabled:opacity-50">
                      {applyingPlan ? "Applying..." : "Apply Plan"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Subtasks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">Subtasks ({subtasks.length})</span>
            <button onClick={() => setShowAddSubtask(true)} className="text-zinc-600 hover:text-zinc-400 transition-colors"><Plus size={14} /></button>
          </div>
          <div className="space-y-1">
            {subtasks.map((sub) => (
              <div key={sub.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm">
                {sub.status === "done" ? <Check size={14} className="text-emerald-500 shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 shrink-0" />}
                <span className={cn("truncate flex-1", sub.status === "done" ? "text-zinc-500 line-through" : "text-zinc-300")}>{sub.title}</span>
                {sub.assignee && <span className="text-[10px] text-zinc-600">@{displayName(sub.assignee).toLowerCase()}</span>}
              </div>
            ))}
            {showAddSubtask && (
              <div className="flex items-center gap-2 mt-1">
                <input autoFocus value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAddSubtask(); if (e.key === "Escape") setShowAddSubtask(false); }} placeholder="Subtask title..." className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded px-2 py-1 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-600" />
              </div>
            )}
          </div>
        </div>

        {/* Activity */}
        <div>
          <span className="text-xs text-zinc-500 mb-2 block">Activity</span>
          <div className="space-y-2">
            {activity.map((act) => (
              <div key={act.id} className="flex items-start gap-2 text-[12px]">
                <span className="text-zinc-600 shrink-0 w-12 tabular-nums">
                  {new Date(act.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
                <span className="text-zinc-500">
                  {act.activity_type === "tracker_ping" && <Sparkles size={10} className="inline mr-1 text-yellow-500" />}
                  {act.actor ? displayName(act.actor) : "System"}:{" "}
                  <span className="text-zinc-400">{act.message}</span>
                </span>
              </div>
            ))}
            {activity.length === 0 && <div className="text-[12px] text-zinc-600">No activity yet</div>}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-zinc-800/50 flex gap-2">
        {task.status !== "done" ? (
          <>
            <button onClick={() => handleStatusChange("in_progress")} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
              <Play size={13} /> Start
            </button>
            <button onClick={() => handleStatusChange("done")} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors">
              <Check size={13} /> Done
            </button>
          </>
        ) : (
          <div className="flex-1 text-center text-sm text-emerald-500 py-1.5">
            Completed {task.completed_at && formatRelativeTime(task.completed_at)}
          </div>
        )}
      </div>
    </div>
  );
}
