"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { CommandBar } from "@/components/command-bar";
import { TaskList } from "@/components/task-list";
import { TaskDetail } from "@/components/task-detail";
import { StatsView } from "@/components/stats-view";
import { TrackerView } from "@/components/tracker-view";
import { useTasks, useEmployees } from "@/lib/hooks/use-tasks";
import { Bell } from "lucide-react";
import { displayName } from "@/lib/utils";

export default function Home() {
  const { tasks, loading: tasksLoading, refetch } = useTasks();
  const { employees, loading: employeesLoading } = useEmployees();
  const [activeView, setActiveView] = useState("tasks");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);


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
            <button className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors">
              <Bell size={16} />
            </button>
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
    </div>
  );
}
