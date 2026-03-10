"use client";

import { useState } from "react";
import {
  CheckSquare,
  BarChart3,
  Zap,
  Hash,
  Plus,
  X,
  Loader,
} from "lucide-react";
import { cn, displayName, getInitials } from "@/lib/utils";
import { useAuth } from "@/lib/auth/context";
import type { Employee } from "@/lib/supabase/types";
import type { Task } from "@/lib/supabase/types";

interface SidebarProps {
  employees: Employee[];
  tasks: Task[];
  activeView: string;
  onNavigate: (view: string) => void;
  selectedEmployeeId: string | null;
  onSelectEmployee: (id: string | null) => void;
  onEmployeeAdded?: () => void;
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
  onEmployeeAdded,
}: SidebarProps) {
  const { employee: currentUser } = useAuth();
  const isManager = currentUser?.role === "manager";
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", role: "developer", nickname: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function getTaskCount(empId: string) {
    return tasks.filter(
      (t) => t.assignee_id === empId && t.status !== "done" && t.status !== "cancelled"
    ).length;
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAddLoading(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "Failed to create employee");
      } else {
        setShowAddModal(false);
        setAddForm({ name: "", email: "", password: "", role: "developer", nickname: "" });
        onEmployeeAdded?.();
      }
    } catch {
      setAddError("Network error");
    } finally {
      setAddLoading(false);
    }
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
      {isManager && (
        <div className="px-2 mt-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-colors"
          >
            <Plus size={14} />
            Add Member
          </button>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/50">
              <h3 className="text-sm font-medium text-zinc-100">Add Team Member</h3>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddMember} className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Full Name *</label>
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  required
                  placeholder="John Doe"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Email *</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  required
                  placeholder="john@company.com"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Password *</label>
                <input
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1">Nickname</label>
                  <input
                    value={addForm.nickname}
                    onChange={(e) => setAddForm({ ...addForm, nickname: e.target.value })}
                    placeholder="Display name"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1">Role</label>
                  <select
                    value={addForm.role}
                    onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 outline-none focus:border-zinc-500 transition-colors"
                  >
                    <option value="developer">Developer</option>
                    <option value="lead">Lead</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
              </div>

              {addError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {addError}
                </div>
              )}

              <button
                type="submit"
                disabled={addLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium rounded-lg hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
              >
                {addLoading && <Loader size={12} className="animate-spin" />}
                {addLoading ? "Creating..." : "Create Member"}
              </button>
            </form>
          </div>
        </div>
      )}

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
