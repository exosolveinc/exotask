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

export function TaskDetail({ taskId, onClose, onRefetch }: TaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [showAddSubtask, setShowAddSubtask] = useState(false);

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
          actor_id: "emp-5",
          activity_type: "created" as const,
          message: "Created this task",
          metadata: {},
          created_at: new Date(Date.now() - 86400000).toISOString(),
          actor: mockEmployees[4],
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

  const isOverdue =
    task.due_at &&
    new Date(task.due_at) < new Date() &&
    task.status !== "done";

  const aiEstimate = task.ai_estimate_hours;
  const actual = task.actual_hours;
  const variance = aiEstimate && actual ? (actual / aiEstimate).toFixed(2) : null;

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
    await createTask({
      title: newSubtask.trim(),
      parent_id: taskId,
      assignee_id: task.assignee_id || undefined,
    });
    setNewSubtask("");
    setShowAddSubtask(false);
    fetchTask();
    onRefetch();
  }

  return (
    <div className="w-96 border-l border-zinc-800/50 bg-zinc-950 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800/50 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-zinc-100 leading-snug">
            {task.title}
          </h3>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border", prio.bg)}>
              {task.priority}
            </span>
            <span className={cn("text-xs", status.color)}>{status.label}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">Progress</span>
            <span className="text-xs text-zinc-400 tabular-nums">
              {task.progress_percent}%
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                task.progress_percent === 100 ? "bg-emerald-500" : "bg-blue-500"
              )}
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
                {new Date(task.due_at).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                {isOverdue && " (overdue)"}
              </span>
            </div>
          )}
          {aiEstimate && (
            <div className="flex items-center gap-2.5 text-sm">
              <Clock size={14} className="text-zinc-600" />
              <span className="text-zinc-400">
                AI est: {aiEstimate}h
                {actual && (
                  <>
                    {" / "}Actual: {actual}h
                    <span
                      className={cn(
                        "ml-1 text-xs",
                        Number(variance) > 1.3
                          ? "text-red-400"
                          : Number(variance) < 0.8
                          ? "text-emerald-400"
                          : "text-zinc-500"
                      )}
                    >
                      ({variance}x)
                    </span>
                  </>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Status changer */}
        <div>
          <span className="text-xs text-zinc-500 mb-2 block">Status</span>
          <div className="flex flex-wrap gap-1.5">
            {statusOptions.map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md border transition-colors",
                  task.status === s
                    ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                )}
              >
                {statusConfig[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Tracker */}
        <div className="bg-zinc-900/50 rounded-lg border border-zinc-800/50 p-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Bot size={14} className="text-yellow-500" />
              Tracker
            </div>
            <button
              onClick={handleToggleTracker}
              className={cn(
                "px-2 py-0.5 text-[10px] rounded border transition-colors",
                task.tracker_enabled
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-zinc-800 border-zinc-700 text-zinc-500"
              )}
            >
              {task.tracker_enabled ? "Active" : "Paused"}
            </button>
          </div>
          <div className="flex gap-1.5">
            {trackerIntervals.map((int) => (
              <button
                key={int.value}
                onClick={() => handleTrackerInterval(int.value)}
                className={cn(
                  "px-2 py-1 text-[11px] rounded border transition-colors",
                  task.tracker_interval_minutes === int.value
                    ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
                )}
              >
                {int.label}
              </button>
            ))}
          </div>
          {task.last_ping_at && (
            <div className="text-[11px] text-zinc-600 mt-2">
              Last ping: {formatRelativeTime(task.last_ping_at)}
              {task.last_response_at && (
                <span className="text-emerald-600"> — responded</span>
              )}
            </div>
          )}
        </div>

        {/* Subtasks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">
              Subtasks ({subtasks.length})
            </span>
            <button
              onClick={() => setShowAddSubtask(true)}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="space-y-1">
            {subtasks.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-sm"
              >
                {sub.status === "done" ? (
                  <Check size={14} className="text-emerald-500 shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 shrink-0" />
                )}
                <span
                  className={cn(
                    "truncate flex-1",
                    sub.status === "done"
                      ? "text-zinc-500 line-through"
                      : "text-zinc-300"
                  )}
                >
                  {sub.title}
                </span>
                {sub.assignee && (
                  <span className="text-[10px] text-zinc-600">
                    @{displayName(sub.assignee).toLowerCase()}
                  </span>
                )}
              </div>
            ))}

            {showAddSubtask && (
              <div className="flex items-center gap-2 mt-1">
                <input
                  autoFocus
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddSubtask();
                    if (e.key === "Escape") setShowAddSubtask(false);
                  }}
                  placeholder="Subtask title..."
                  className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded px-2 py-1 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
                />
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
                  {new Date(act.created_at).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-zinc-500">
                  {act.activity_type === "tracker_ping" && "🤖 "}
                  {act.actor ? displayName(act.actor) : "System"}:{" "}
                  <span className="text-zinc-400">{act.message}</span>
                </span>
              </div>
            ))}
            {activity.length === 0 && (
              <div className="text-[12px] text-zinc-600">No activity yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-5 py-3 border-t border-zinc-800/50 flex gap-2">
        {task.status !== "done" ? (
          <>
            <button
              onClick={() => handleStatusChange("in_progress")}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              <Play size={13} />
              Start
            </button>
            <button
              onClick={() => handleStatusChange("done")}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
            >
              <Check size={13} />
              Done
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
