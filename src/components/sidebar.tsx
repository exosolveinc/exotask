"use client";

import {
  CheckSquare,
  BarChart3,
  Zap,
  Hash,
} from "lucide-react";
import { cn, displayName, getInitials } from "@/lib/utils";
import type { Employee } from "@/lib/supabase/types";
import type { Task } from "@/lib/supabase/types";

interface SidebarProps {
  employees: Employee[];
  tasks: Task[];
  activeView: string;
  onNavigate: (view: string) => void;
  selectedEmployeeId: string | null;
  onSelectEmployee: (id: string | null) => void;
}

const navItems = [
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "tracker", label: "Agents", icon: Zap },
];

export function Sidebar({
  employees,
  tasks,
  activeView,
  onNavigate,
  selectedEmployeeId,
  onSelectEmployee,
}: SidebarProps) {
  function getTaskCount(empId: string) {
    return tasks.filter(
      (t) => t.assignee_id === empId && t.status !== "done" && t.status !== "cancelled"
    ).length;
  }

  return (
    <aside className="w-56 h-full bg-zinc-950 border-r border-zinc-800/50 flex flex-col">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-semibold text-zinc-100 text-sm tracking-tight">
            ExoTask
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-2 py-3 space-y-0.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              onNavigate(item.id);
              onSelectEmployee(null);
            }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
              activeView === item.id && !selectedEmployeeId
                ? "bg-zinc-800/80 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
            )}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Team */}
      <div className="px-2 mt-4">
        <div className="px-3 mb-2 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
          Team
        </div>
        <div className="space-y-0.5">
          {employees.map((emp) => {
            const count = getTaskCount(emp.id);
            return (
              <button
                key={emp.id}
                onClick={() => {
                  onSelectEmployee(emp.id);
                  onNavigate("tasks");
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors",
                  selectedEmployeeId === emp.id
                    ? "bg-zinc-800/80 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                )}
              >
                <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[9px] font-medium text-zinc-400 shrink-0">
                  {getInitials(emp.name)}
                </div>
                <span className="truncate">{displayName(emp)}</span>
                {count > 0 && (
                  <span className="ml-auto text-[10px] text-zinc-500 tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Integrations */}
      <div className="px-2 mt-auto mb-4">
        <div className="px-3 mb-2 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
          Channels
        </div>
        <div className="space-y-0.5 text-sm text-zinc-500">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Hash size={14} /> #dev-tasks
          </div>
        </div>
      </div>
    </aside>
  );
}
