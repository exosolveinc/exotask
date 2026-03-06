"use client";

import { Command } from "cmdk";
import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Search,
  Zap,
  BarChart3,
  CheckCircle,
} from "lucide-react";
import type { Employee } from "@/lib/supabase/types";
import { createTask } from "@/lib/hooks/use-tasks";
import { displayName, getInitials } from "@/lib/utils";

interface CommandBarProps {
  employees: Employee[];
  onTaskCreated: () => void;
  onNavigate: (view: string) => void;
}

export function CommandBar({ employees, onTaskCreated, onNavigate }: CommandBarProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleQuickTask = useCallback(
    async (rawInput: string) => {
      // Parse: /task @name Title P0-P3 --due <date>
      const input = rawInput.replace(/^\/task\s*/, "");

      // Extract @mention
      const mentionMatch = input.match(/@(\w+)/);
      let assignee: Employee | undefined;
      if (mentionMatch) {
        const name = mentionMatch[1].toLowerCase();
        assignee = employees.find(
          (e) => e.name.toLowerCase().includes(name) || e.email.startsWith(name)
        );
      }

      // Extract priority
      const priorityMatch = input.match(/\b(P[0-3])\b/i);
      const priority = priorityMatch ? priorityMatch[1].toUpperCase() : "P2";

      // Extract --due
      const dueMatch = input.match(/--due\s+(\S+)/);
      let dueAt: string | undefined;
      if (dueMatch) {
        const val = dueMatch[1].toLowerCase();
        const now = new Date();
        if (val === "tomorrow") {
          now.setDate(now.getDate() + 1);
          dueAt = now.toISOString();
        } else if (val.endsWith("h")) {
          now.setHours(now.getHours() + parseInt(val));
          dueAt = now.toISOString();
        } else if (val.endsWith("d")) {
          now.setDate(now.getDate() + parseInt(val));
          dueAt = now.toISOString();
        } else {
          dueAt = new Date(val).toISOString();
        }
      }

      // Clean title: remove @mention, priority, --due
      let title = input
        .replace(/@\w+/, "")
        .replace(/\b(P[0-3])\b/i, "")
        .replace(/--due\s+\S+/, "")
        .replace(/--track\s+\S+/, "")
        .trim();

      if (!title) return;

      await createTask({
        title,
        assignee_id: assignee?.id,
        priority,
        due_at: dueAt,
      });

      onTaskCreated();
      setInputValue("");
      setOpen(false);
    },
    [employees, onTaskCreated]
  );

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-400 bg-zinc-800/50 border border-zinc-700/50 rounded-lg hover:bg-zinc-800 hover:border-zinc-600 transition-colors"
      >
        <Search size={14} />
        <span>Command</span>
        <kbd className="ml-2 px-1.5 py-0.5 text-[10px] bg-zinc-700/50 rounded border border-zinc-600/50">
          ⌘K
        </kbd>
      </button>

      {/* Command dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-xl">
            <Command
              className="bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden"
              shouldFilter={true}
            >
              <div className="flex items-center border-b border-zinc-800 px-4">
                <Search size={16} className="text-zinc-500 shrink-0" />
                <Command.Input
                  value={inputValue}
                  onValueChange={setInputValue}
                  placeholder="Type a command or /task @name ..."
                  className="w-full py-3.5 px-3 bg-transparent text-zinc-100 text-sm placeholder:text-zinc-500 outline-none"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      inputValue.startsWith("/task ")
                    ) {
                      e.preventDefault();
                      handleQuickTask(inputValue);
                    }
                  }}
                />
              </div>

              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="py-8 text-center text-sm text-zinc-500">
                  No results. Try /task @name Title P1
                </Command.Empty>

                <Command.Group
                  heading="Quick Actions"
                  className="text-xs text-zinc-500 px-2 py-1.5"
                >
                  <Command.Item
                    onSelect={() => {
                      setInputValue("/task @");
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-100"
                  >
                    <Plus size={16} className="text-emerald-400" />
                    New Task
                    <span className="ml-auto text-xs text-zinc-600">/task</span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => onNavigate("tasks")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-100"
                  >
                    <CheckCircle size={16} className="text-blue-400" />
                    View All Tasks
                  </Command.Item>

                  <Command.Item
                    onSelect={() => onNavigate("stats")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-100"
                  >
                    <BarChart3 size={16} className="text-purple-400" />
                    Team Stats
                  </Command.Item>

                  <Command.Item
                    onSelect={() => onNavigate("tracker")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-100"
                  >
                    <Zap size={16} className="text-yellow-400" />
                    Tracker Settings
                  </Command.Item>
                </Command.Group>

                <Command.Separator className="my-2 h-px bg-zinc-800" />

                <Command.Group
                  heading="Assign to"
                  className="text-xs text-zinc-500 px-2 py-1.5"
                >
                  {employees.map((emp) => (
                    <Command.Item
                      key={emp.id}
                      value={emp.name}
                      onSelect={() => {
                        setInputValue(
                          `/task @${displayName(emp).toLowerCase()} `
                        );
                      }}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-100"
                    >
                      <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-300">
                        {getInitials(emp.name)}
                      </div>
                      <span>{displayName(emp)}</span>
                      <span className="ml-auto text-xs text-zinc-600">
                        {emp.role}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>

              <div className="border-t border-zinc-800 px-4 py-2.5 flex items-center gap-4 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-[10px]">↑↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-[10px]">↵</kbd>
                  select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-[10px]">esc</kbd>
                  close
                </span>
              </div>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
