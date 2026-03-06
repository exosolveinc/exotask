"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { mockStore } from "@/lib/mock-store";
import { mockEmployees } from "@/lib/mock-data";
import type { Task, Employee } from "@/lib/supabase/types";

const isMock = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL === "";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (isMock) {
      setTasks(mockStore.getTasks());
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("tasks")
      .select("*, assignee:employees!assignee_id(*)")
      .is("parent_id", null)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const typedData = data as Record<string, unknown>[];
      const taskIds = typedData.map((t) => t.id as string);
      const { data: subtasks } = await supabase
        .from("tasks")
        .select("*, assignee:employees!assignee_id(*)")
        .in("parent_id", taskIds)
        .order("sort_order");

      const typedSubs = (subtasks || []) as Record<string, unknown>[];
      const tasksWithSubs = typedData.map((task) => ({
        ...task,
        subtasks: typedSubs.filter((s) => s.parent_id === task.id),
      }));

      setTasks(tasksWithSubs as unknown as Task[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();

    if (isMock) {
      // Subscribe to mock store changes
      const unsub = mockStore.subscribe(() => {
        setTasks(mockStore.getTasks());
      });
      return unsub;
    }

    const channel = supabase
      .channel("tasks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => fetchTasks()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTasks]);

  return { tasks, loading, refetch: fetchTasks };
}

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isMock) {
      setEmployees(mockEmployees);
      setLoading(false);
      return;
    }

    async function fetch() {
      const { data } = await supabase
        .from("employees")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (data) setEmployees(data as Employee[]);
      setLoading(false);
    }
    fetch();
  }, []);

  return { employees, loading };
}

export async function createTask(input: {
  title: string;
  assignee_id?: string;
  priority?: string;
  due_at?: string;
  parent_id?: string;
  description?: string;
  created_by_id?: string;
}) {
  if (isMock) {
    return mockStore.addTask(input);
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      assignee_id: input.assignee_id || null,
      priority: input.priority || "P2",
      due_at: input.due_at || null,
      parent_id: input.parent_id || null,
      description: input.description || null,
      created_by_id: input.created_by_id || null,
    } as Record<string, unknown>)
    .select()
    .single();

  if (error) throw error;

  const row = data as Record<string, unknown> | null;
  if (row) {
    await supabase.from("task_activity").insert({
      task_id: row.id,
      actor_id: input.created_by_id || null,
      activity_type: "created",
      message: `Created task: ${input.title}`,
    } as Record<string, unknown>);

    // Fire-and-forget: get AI estimate if not already set
    if (!input.parent_id) {
      autoEstimateTask(row.id as string, input.title, input.description);
    }
  }

  return data;
}

export async function updateTask(taskId: string, updates: Partial<Task>) {
  if (isMock) {
    return mockStore.updateTask(taskId, updates);
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(updates as Record<string, unknown>)
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTaskStatus(
  taskId: string,
  status: Task["status"],
  actorId?: string
) {
  if (isMock) {
    return mockStore.updateTaskStatus(taskId, status);
  }

  const updates: Partial<Task> = { status };

  if (status === "in_progress" && !updates.started_at) {
    updates.started_at = new Date().toISOString();
  }
  if (status === "done") {
    updates.completed_at = new Date().toISOString();
    updates.progress_percent = 100;
  }

  // Fetch current task to get started_at for actual_hours calculation
  let taskBeforeUpdate: Record<string, unknown> | null = null;
  if (status === "done") {
    const { data: existing } = await supabase
      .from("tasks")
      .select("started_at, ai_estimate_hours, assignee_id")
      .eq("id", taskId)
      .single();
    taskBeforeUpdate = existing as Record<string, unknown> | null;

    // Calculate actual hours from started_at to now
    if (taskBeforeUpdate?.started_at) {
      const startedAt = new Date(taskBeforeUpdate.started_at as string);
      const actualHours = (Date.now() - startedAt.getTime()) / 3600000;
      updates.actual_hours = Math.round(actualHours * 10) / 10;
    }
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(updates as Record<string, unknown>)
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw error;

  await supabase.from("task_activity").insert({
    task_id: taskId,
    actor_id: actorId || null,
    activity_type: "status_change",
    message: `Status changed to ${status}`,
    metadata: { new_status: status },
  } as Record<string, unknown>);

  // On completion: update employee stats (variance, tasks_completed, on_time)
  if (status === "done" && taskBeforeUpdate?.assignee_id) {
    updateEmployeeStats(taskBeforeUpdate.assignee_id as string);
  }

  return data;
}

/** Fire-and-forget: call AI suggest to populate ai_estimate_hours on new tasks */
async function autoEstimateTask(taskId: string, title: string, description?: string) {
  try {
    const res = await fetch("/api/ai/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
    if (!res.ok) return;
    const suggestion = await res.json();
    if (suggestion.estimate_hours) {
      await supabase
        .from("tasks")
        .update({ ai_estimate_hours: suggestion.estimate_hours } as Record<string, unknown>)
        .eq("id", taskId);
    }
  } catch {
    // Silent — estimation is best-effort
  }
}

/** Recalculate employee stats after task completion */
async function updateEmployeeStats(employeeId: string) {
  try {
    // Get all completed tasks for this employee
    const { data: completedTasks } = await supabase
      .from("tasks")
      .select("ai_estimate_hours, actual_hours, due_at, completed_at")
      .eq("assignee_id", employeeId)
      .eq("status", "done");

    if (!completedTasks || completedTasks.length === 0) return;

    const tasks = completedTasks as Record<string, unknown>[];
    const tasksCompleted = tasks.length;

    // Calculate avg variance ratio (actual / estimated)
    const withBothHours = tasks.filter(
      (t) => t.ai_estimate_hours && t.actual_hours
    );
    const avgVariance =
      withBothHours.length > 0
        ? withBothHours.reduce(
            (sum, t) =>
              sum + (t.actual_hours as number) / (t.ai_estimate_hours as number),
            0
          ) / withBothHours.length
        : 1.0;

    // Calculate on-time percentage
    const withDeadline = tasks.filter((t) => t.due_at && t.completed_at);
    const onTime = withDeadline.filter(
      (t) => new Date(t.completed_at as string) <= new Date(t.due_at as string)
    );
    const onTimePercentage =
      withDeadline.length > 0
        ? Math.round((onTime.length / withDeadline.length) * 100)
        : 100;

    await supabase
      .from("employees")
      .update({
        tasks_completed: tasksCompleted,
        avg_variance_ratio: Math.round(avgVariance * 100) / 100,
        on_time_percentage: onTimePercentage,
      } as Record<string, unknown>)
      .eq("id", employeeId);
  } catch {
    // Silent — stats update is best-effort
  }
}
