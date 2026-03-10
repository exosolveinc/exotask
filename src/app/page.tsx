"use client";

import { useState, useRef, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { CommandBar } from "@/components/command-bar";
import { TaskList } from "@/components/task-list";
import { TaskDetail } from "@/components/task-detail";
import { StatsView } from "@/components/stats-view";
import { TrackerView } from "@/components/tracker-view";
import { ProposalsPanel } from "@/components/proposals-panel";
import { ProfilePanel } from "@/components/profile-panel";
import { useTasks, useEmployees } from "@/lib/hooks/use-tasks";
import { useAuth } from "@/lib/auth/context";
import { Bell, LogOut, User, ChevronDown } from "lucide-react";
import { displayName, getInitials } from "@/lib/utils";

export default function Home() {
  const { user, employee, signOut } = useAuth();
  const { tasks, loading: tasksLoading, refetch } = useTasks();
  const { employees, loading: employeesLoading, refetch: refetchEmployees } = useEmployees();
  const [activeView, setActiveView] = useState("tasks");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100 font-[family-name:var(--font-geist-sans)]">
      {/* Sidebar */}
      <Sidebar
        employees={employees}
        tasks={tasks}
        activeView={activeView}
        onNavigate={setActiveView}
        selectedEmployeeId={selectedEmployeeId}
        onSelectEmployee={setSelectedEmployeeId}
        onEmployeeAdded={refetchEmployees}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 border-b border-zinc-800/50 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-medium text-zinc-300">
              {activeView === "tasks" && (selectedEmployeeId
                ? `${(() => { const emp = employees.find((e) => e.id === selectedEmployeeId); return emp ? displayName(emp) : ""; })()}'s Tasks`
                : "All Tasks")}
              {activeView === "stats" && "Team Stats"}
              {activeView === "tracker" && "Agent Registry"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <CommandBar
              employees={employees}
              onTaskCreated={refetch}
              onNavigate={(view) => {
                setActiveView(view);
                setSelectedEmployeeId(null);
              }}
            />
            <button
              onClick={() => setProposalsOpen(true)}
              className="relative p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Bell size={16} />
            </button>
            {user && (
              <div className="relative ml-1 pl-2 border-l border-zinc-800" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-zinc-800/70 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-300">
                    {employee ? getInitials(employee.name) : (user.email?.[0] ?? "?").toUpperCase()}
                  </div>
                  <span className="text-xs text-zinc-400 hidden sm:inline">
                    {employee ? displayName(employee) : user.email}
                  </span>
                  <ChevronDown size={12} className="text-zinc-600" />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-zinc-900 border border-zinc-700/50 rounded-lg shadow-xl py-1 z-50">
                    {employee && (
                      <>
                        <button
                          onClick={() => { setProfileOpen(true); setMenuOpen(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                        >
                          <User size={14} className="text-zinc-500" />
                          Profile
                        </button>
                        <div className="my-1 h-px bg-zinc-800" />
                      </>
                    )}
                    <button
                      onClick={() => { signOut(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-zinc-800 transition-colors"
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {tasksLoading || employeesLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-sm text-zinc-600">Loading...</div>
            </div>
          ) : (
            <>
              {activeView === "tasks" && (
                <TaskList
                  tasks={tasks}
                  employees={employees}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={setSelectedTaskId}
                  filterEmployeeId={selectedEmployeeId}
                  onTaskCreated={refetch}
                />
              )}
              {activeView === "stats" && (
                <StatsView employees={employees} tasks={tasks} />
              )}
              {activeView === "tracker" && (
                <TrackerView tasks={tasks} onRefetch={refetch} />
              )}

              {/* Detail panel */}
              {selectedTaskId && activeView === "tasks" && (
                <TaskDetail
                  taskId={selectedTaskId}
                  onClose={() => setSelectedTaskId(null)}
                  onRefetch={refetch}
                />
              )}
            </>
          )}
        </div>
      </div>

      <ProposalsPanel
        open={proposalsOpen}
        onClose={() => setProposalsOpen(false)}
        onProposalActioned={refetch}
      />

      {employee && (
        <ProfilePanel
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          employee={employee}
          onUpdated={refetch}
        />
      )}
    </div>
  );
}
