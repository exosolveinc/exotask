import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Employee, TaskPriority, TaskStatus } from "./supabase/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const priorityConfig: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  P0: { label: "P0", color: "text-red-400", bg: "bg-red-500/15 border-red-500/30" },
  P1: { label: "P1", color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30" },
  P2: { label: "P2", color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30" },
  P3: { label: "P3", color: "text-zinc-400", bg: "bg-zinc-500/15 border-zinc-500/30" },
};

export const statusConfig: Record<TaskStatus, { label: string; color: string; icon: string }> = {
  pending: { label: "Pending", color: "text-zinc-400", icon: "circle" },
  acknowledged: { label: "Acknowledged", color: "text-blue-400", icon: "circle-dot" },
  in_progress: { label: "In Progress", color: "text-yellow-400", icon: "loader" },
  blocked: { label: "Blocked", color: "text-red-400", icon: "octagon-x" },
  review: { label: "Review", color: "text-purple-400", icon: "eye" },
  done: { label: "Done", color: "text-green-400", icon: "check-circle" },
  cancelled: { label: "Cancelled", color: "text-zinc-500", icon: "x-circle" },
};

export function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function displayName(emp: Employee): string {
  return emp.nickname || emp.name.split(" ")[0];
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
