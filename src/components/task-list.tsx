"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Circle,
  CircleDot,
  Loader,
  OctagonX,
  Eye,
  CheckCircle,
  XCircle,
  Bot,
  AlertTriangle,
  Plus,
  Sparkles,
} from "lucide-react";
import { cn, priorityConfig, statusConfig, getInitials, displayName } from "@/lib/utils";
import type { Task, TaskPriority, Employee } from "@/lib/supabase/types";
import { createTask } from "@/lib/hooks/use-tasks";

const statusIcons: Record<string, React.ElementType> = {
  circle: Circle,
  "circle-dot": CircleDot,
  loader: Loader,
  "octagon-x": OctagonX,
  eye: Eye,
  "check-circle": CheckCircle,
  "x-circle": XCircle,
};

interface TaskListProps {
  tasks: Task[];
  employees: Employee[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  filterEmployeeId: string | null;
  onTaskCreated: () => void;
}

// Parse shortcut syntax from title: @name P0-P3 /2d
function parseShortcuts(raw: string, employees: Employee[]) {
  let title = raw;
  let assignee_id: string | undefined;
  let priority: TaskPriority | undefined;
  let due_at: string | undefined;

  // Match @name
  const atMatch = title.match(/@(\w+)/);
  if (atMatch) {
    const query = atMatch[1].toLowerCase();
    const emp = employees.find(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        (e.nickname && e.nickname.toLowerCase().includes(query))
    );
    if (emp) assignee_id = emp.id;
    title = title.replace(/@\w+/, "").trim();
  }

  // Match P0-P3
  const prioMatch = title.match(/\b(P[0-3])\b/i);
  if (prioMatch) {
    priority = prioMatch[1].toUpperCase() as TaskPriority;
    title = title.replace(/\b(P[0-3])\b/i, "").trim();
  }

  // Match /2d, /3h, /1w
  const dueMatch = title.match(/\/(\d+)([dhw])/i);
  if (dueMatch) {
    const amount = parseInt(dueMatch[1]);
    const unit = dueMatch[2].toLowerCase();
    const now = new Date();
    if (unit === "h") now.setHours(now.getHours() + amount);
    else if (unit === "d") now.setDate(now.getDate() + amount);
    else if (unit === "w") now.setDate(now.getDate() + amount * 7);
    due_at = now.toISOString();
    title = title.replace(/\/\d+[dhw]/i, "").trim();
  }

  // Clean up extra spaces
  title = title.replace(/\s+/g, " ").trim();

  return { title, assignee_id, priority, due_at };
}

interface InlineTaskCreatorProps {
  employees: Employee[];
  parentId?: string;
  onCreated: () => void;
  onCancel: () => void;
  depth?: number;
}

interface AISuggestion {
  priority?: string;
  assignee_id?: string;
  assignee_reason?: string;
  estimate_hours?: number;
  suggested_deadline_hours?: number;
  reasoning?: string;
}

function InlineTaskCreator({
  employees,
  parentId,
  onCreated,
  onCancel,
  depth = 0,
}: InlineTaskCreatorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced AI suggestion fetch — triggers on any title 3+ chars
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Strip shortcut syntax to get the raw title for AI
    const trimmed = value.trim()
      .replace(/@\w+/g, "")
      .replace(/\bP[0-3]\b/gi, "")
      .replace(/\/\d+[dhw]/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (trimmed.length < 3) {
      setSuggestion(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestion(true);
      try {
        const res = await fetch("/api/ai/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        });
        const data = await res.json();
        if (res.ok && !data.error) {
          setSuggestion(data);
        }
      } catch {
        // Silent
      } finally {
        setLoadingSuggestion(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const handleSubmit = useCallback(
    async (continueAdding = false) => {
      const trimmed = value.trim();
      if (!trimmed || submitting) return;

      setSubmitting(true);
      const parsed = parseShortcuts(trimmed, employees);

      // Auto-apply AI suggestion for fields the user didn't manually specify
      const finalAssignee = parsed.assignee_id || suggestion?.assignee_id || undefined;
      const finalPriority = parsed.priority || (suggestion?.priority ? suggestion.priority as TaskPriority : undefined);
      const finalDue = parsed.due_at || (suggestion?.suggested_deadline_hours
        ? new Date(Date.now() + suggestion.suggested_deadline_hours * 3600000).toISOString()
        : undefined);

      try {
        await createTask({
          title: parsed.title,
          assignee_id: finalAssignee,
          priority: finalPriority,
          due_at: finalDue,
          parent_id: parentId,
        });
        onCreated();
        if (continueAdding) {
          setValue("");
          setSuggestion(null);
          inputRef.current?.focus();
        } else {
          onCancel();
        }
      } catch {
        // keep form open on error
      } finally {
        setSubmitting(false);
      }
    },
    [value, submitting, employees, parentId, onCreated, onCancel, suggestion]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      handleSubmit(true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit(false);
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const suggestedEmployee = suggestion?.assignee_id
    ? employees.find((e) => e.id === suggestion.assignee_id)
    : null;

  return (
    <div
      className="space-y-1"
      style={{ marginLeft: `${12 + depth * 20}px`, marginRight: "12px" }}
    >
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/60 ring-1 ring-zinc-700/50">
        <Plus size={14} className="text-zinc-500 shrink-0" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // delay to allow clicking suggestion
            setTimeout(() => {
              if (!value.trim()) onCancel();
            }, 200);
          }}
          placeholder={
            parentId
              ? "Subtask title... (@name P1 /2d)"
              : "Task title... (@name P1 /2d)"
          }
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
          disabled={submitting}
        />
        {loadingSuggestion && (
          <Loader size={12} className="text-zinc-600 animate-spin shrink-0" />
        )}
        <span className="text-[10px] text-zinc-600 shrink-0">
          Enter to add{" "}
          <span className="text-zinc-500">Shift+Enter</span> for another
        </span>
      </div>

      {/* AI Suggestion — auto-applied, shown as preview */}
      {suggestion && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/8 border border-purple-500/20">
          <Sparkles size={12} className="text-purple-400 shrink-0" />
          <span className="text-[11px] text-purple-300/80 flex-1">
            AI will assign:{" "}
            <span className="text-purple-300 font-medium">{suggestion.priority}</span>
            {suggestedEmployee && (
              <>
                {" "}→{" "}
                <span className="text-purple-300 font-medium">
                  {displayName(suggestedEmployee)}
                </span>
              </>
            )}
            {suggestion.estimate_hours && (
              <span className="text-zinc-500"> ~{suggestion.estimate_hours}h</span>
            )}
            {suggestion.suggested_deadline_hours && (
              <span className="text-zinc-500"> due in {suggestion.suggested_deadline_hours}h</span>
            )}
            {suggestion.reasoning && (
              <span className="text-zinc-600 ml-1">— {suggestion.reasoning}</span>
            )}
          </span>
          <button
            onClick={() => setSuggestion(null)}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 shrink-0"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          percent === 100
            ? "bg-emerald-500"
            : percent >= 60
            ? "bg-blue-500"
            : percent >= 30
            ? "bg-yellow-500"
            : "bg-zinc-600"
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function TaskRow({
  task,
  depth = 0,
  selectedTaskId,
  onSelectTask,
  employees,
  onTaskCreated,
}: {
  task: Task;
  depth?: number;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  employees: Employee[];
  onTaskCreated: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const hasSubtasks = task.subtasks && task.subtasks.length > 0;
  const config = statusConfig[task.status];
  const prioConfig = priorityConfig[task.priority];
  const StatusIcon = statusIcons[config.icon] || Circle;

  const isOverdue =
    task.due_at &&
    new Date(task.due_at) < new Date() &&
    task.status !== "done" &&
    task.status !== "cancelled";

  const showAddSubtask =
    expanded && task.status !== "done" && task.status !== "cancelled" && !task.parent_id;

  return (
    <div className="group/task overflow-visible">
      <div
        onClick={() => onSelectTask(task.id)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
          selectedTaskId === task.id
            ? "bg-zinc-800/80 ring-1 ring-zinc-700/50"
            : "hover:bg-zinc-800/40"
        )}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className={cn(
            "w-4 h-4 flex items-center justify-center shrink-0",
            hasSubtasks ? "text-zinc-500" : "invisible"
          )}
        >
          {expanded ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
        </button>

        {/* Status icon */}
        <StatusIcon
          size={16}
          className={cn(config.color, "shrink-0", {
            "animate-spin": task.status === "in_progress",
          })}
        />

        {/* Title */}
        <span
          className={cn(
            "text-sm truncate flex-1",
            task.status === "done"
              ? "text-zinc-500 line-through"
              : "text-zinc-200"
          )}
        >
          {task.title}
        </span>

        {/* Overdue badge */}
        {isOverdue && (
          <AlertTriangle size={13} className="text-red-400 shrink-0" />
        )}

        {/* Tracker indicator */}
        {task.tracker_enabled && task.status !== "done" && (
          <Bot size={13} className="text-zinc-600 shrink-0" />
        )}

        {/* Assignee */}
        {task.assignee && (
          <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[9px] font-medium text-zinc-400 shrink-0 border border-zinc-700/50">
            {getInitials(task.assignee.name)}
          </div>
        )}

        {/* Priority */}
        <span
          className={cn(
            "text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0",
            prioConfig.bg
          )}
        >
          {task.priority}
        </span>

        {/* Progress */}
        <ProgressBar percent={task.progress_percent} />
        <span className="text-[11px] text-zinc-500 tabular-nums w-8 text-right shrink-0">
          {task.progress_percent}%
        </span>
      </div>

      {/* Subtasks */}
      {expanded &&
        hasSubtasks &&
        task.subtasks!.map((sub) => (
          <TaskRow
            key={sub.id}
            task={sub}
            depth={depth + 1}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            employees={employees}
            onTaskCreated={onTaskCreated}
          />
        ))}

      {/* Add subtask row */}
      {showAddSubtask && !addingSubtask && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAddingSubtask(true);
          }}
          className="flex items-center gap-2 py-1.5 text-zinc-600 hover:text-zinc-400 transition-colors opacity-0 group-hover/task:opacity-100 hover:!opacity-100 focus:opacity-100"
          style={{ paddingLeft: `${12 + (depth + 1) * 20}px` }}
        >
          <Plus size={12} />
          <span className="text-[11px]">Add subtask</span>
        </button>
      )}

      {showAddSubtask && addingSubtask && (
        <InlineTaskCreator
          employees={employees}
          parentId={task.id}
          onCreated={onTaskCreated}
          onCancel={() => setAddingSubtask(false)}
          depth={depth + 1}
        />
      )}
    </div>
  );
}

export function TaskList({
  tasks,
  employees,
  selectedTaskId,
  onSelectTask,
  filterEmployeeId,
  onTaskCreated,
}: TaskListProps) {
  const [addingTask, setAddingTask] = useState(false);

  const filteredTasks = filterEmployeeId
    ? tasks.filter((t) => t.assignee_id === filterEmployeeId)
    : tasks;

  const activeTasks = filteredTasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );
  const doneTasks = filteredTasks.filter((t) => t.status === "done");

  // Keyboard shortcut: N to create new task
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Ignore if typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setAddingTask(true);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between px-3 mb-3">
        <h2 className="text-sm font-medium text-zinc-300">
          Active Tasks
          <span className="ml-2 text-zinc-600">{activeTasks.length}</span>
        </h2>
      </div>

      {activeTasks.length === 0 && !addingTask && (
        <div className="py-12 text-center text-sm text-zinc-600">
          No active tasks. Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[11px]">N</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[11px]">⌘K</kbd> to create one.
        </div>
      )}

      {activeTasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
          employees={employees}
          onTaskCreated={onTaskCreated}
        />
      ))}

      {/* New task inline creator */}
      {addingTask ? (
        <InlineTaskCreator
          employees={employees}
          onCreated={onTaskCreated}
          onCancel={() => setAddingTask(false)}
        />
      ) : (
        <button
          onClick={() => setAddingTask(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/30 transition-colors mt-1"
          style={{ paddingLeft: "12px" }}
        >
          <Plus size={14} />
          <span className="text-sm">New task...</span>
        </button>
      )}

      {/* Completed */}
      {doneTasks.length > 0 && (
        <>
          <div className="px-3 pt-4 pb-2">
            <h2 className="text-sm font-medium text-zinc-500">
              Completed
              <span className="ml-2 text-zinc-600">{doneTasks.length}</span>
            </h2>
          </div>
          {doneTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
              employees={employees}
              onTaskCreated={onTaskCreated}
            />
          ))}
        </>
      )}
    </div>
  );
}
