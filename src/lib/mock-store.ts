import type { Task, Employee } from "./supabase/types";
import { mockEmployees, mockTasks } from "./mock-data";

type Listener = () => void;

class MockStore {
  private tasks: Task[] = [...mockTasks];
  private employees: Employee[] = [...mockEmployees];
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  getTasks(): Task[] {
    return this.tasks;
  }

  getEmployees(): Employee[] {
    return this.employees;
  }

  addTask(input: {
    title: string;
    assignee_id?: string;
    priority?: string;
    due_at?: string;
    parent_id?: string;
    description?: string;
    created_by_id?: string;
  }): Task {
    const assignee = input.assignee_id
      ? this.employees.find((e) => e.id === input.assignee_id)
      : undefined;

    const newTask: Task = {
      id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      parent_id: input.parent_id || null,
      title: input.title,
      description: input.description || null,
      status: "pending",
      priority: (input.priority as Task["priority"]) || "P2",
      assignee_id: input.assignee_id || null,
      created_by_id: input.created_by_id || null,
      ai_estimate_hours: null,
      actual_hours: null,
      due_at: input.due_at || null,
      started_at: null,
      completed_at: null,
      tracker_enabled: true,
      tracker_interval_minutes: 60,
      current_escalation: "slack",
      last_ping_at: null,
      last_response_at: null,
      progress_percent: 0,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignee,
      subtasks: [],
    };

    if (input.parent_id) {
      // Add as subtask
      this.tasks = this.tasks.map((t) => {
        if (t.id === input.parent_id) {
          return { ...t, subtasks: [...(t.subtasks || []), newTask] };
        }
        return t;
      });
    } else {
      // Add as top-level task
      this.tasks = [newTask, ...this.tasks];
    }

    this.notify();
    return newTask;
  }

  updateTask(taskId: string, updates: Partial<Task>): Task | null {
    let found: Task | null = null;

    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        found = { ...t, ...updates, updated_at: new Date().toISOString() };
        return found;
      }
      // Check subtasks
      if (t.subtasks) {
        const updatedSubs = t.subtasks.map((s) => {
          if (s.id === taskId) {
            found = { ...s, ...updates, updated_at: new Date().toISOString() };
            return found;
          }
          return s;
        });
        if (found) return { ...t, subtasks: updatedSubs };
      }
      return t;
    });

    if (found) this.notify();
    return found;
  }

  updateTaskStatus(taskId: string, status: Task["status"]): Task | null {
    const updates: Partial<Task> = { status };
    if (status === "in_progress") updates.started_at = new Date().toISOString();
    if (status === "done") {
      updates.completed_at = new Date().toISOString();
      updates.progress_percent = 100;
    }
    return this.updateTask(taskId, updates);
  }
}

// Singleton
export const mockStore = new MockStore();
