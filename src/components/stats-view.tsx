"use client";

import { useState, useEffect } from "react";
import {
  Brain,
  Loader,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn, displayName, getInitials } from "@/lib/utils";
import type { Employee, Task } from "@/lib/supabase/types";

interface StatsViewProps {
  employees: Employee[];
  tasks: Task[];
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          color || "text-zinc-100"
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function VarianceBar({ ratio }: { ratio: number }) {
  const percent = Math.min(
    Math.max(((ratio - 0.5) / 1.5) * 100, 0),
    100
  );
  const isGood = ratio <= 1.1;
  const isOk = ratio <= 1.3;

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-zinc-800 rounded-full relative overflow-hidden">
        <div
          className="absolute top-0 bottom-0 w-px bg-zinc-600"
          style={{ left: `${((1.0 - 0.5) / 1.5) * 100}%` }}
        />
        <div
          className={cn(
            "h-full rounded-full",
            isGood
              ? "bg-emerald-500"
              : isOk
              ? "bg-yellow-500"
              : "bg-red-500"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs tabular-nums",
          isGood
            ? "text-emerald-400"
            : isOk
            ? "text-yellow-400"
            : "text-red-400"
        )}
      >
        {ratio.toFixed(1)}x
      </span>
    </div>
  );
}

function WorkloadBar({ active, total }: { active: number; total: number }) {
  const maxTasks = 8;
  const percent = Math.min((active / maxTasks) * 100, 100);
  const isHeavy = active >= 5;
  const isModerate = active >= 3;

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full",
            isHeavy
              ? "bg-red-500"
              : isModerate
              ? "bg-yellow-500"
              : "bg-emerald-500"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs tabular-nums",
          isHeavy
            ? "text-red-400"
            : isModerate
            ? "text-yellow-400"
            : "text-emerald-400"
        )}
      >
        {active}/{total}
      </span>
    </div>
  );
}

interface AIAnalysis {
  summary: string;
  bottlenecks: string[];
  recommendations: string[];
  risk_tasks: string[];
  workload_balance: string;
  estimated_team_velocity: string;
}

export function StatsView({ employees, tasks }: StatsViewProps) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const allSubtasks = tasks.flatMap((t) => t.subtasks || []);
  const allTasks = [...tasks, ...allSubtasks];
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t) => t.status === "done");
  const activeTasks = allTasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );
  const overdueTasks = activeTasks.filter(
    (t) => t.due_at && new Date(t.due_at) < new Date()
  );
  const blockedTasks = activeTasks.filter((t) => t.status === "blocked");

  const avgVariance =
    employees.length > 0
      ? employees.reduce((sum, e) => sum + e.avg_variance_ratio, 0) /
        employees.length
      : 1.0;

  const onTimeRate =
    employees.length > 0
      ? employees.reduce((sum, e) => sum + e.on_time_percentage, 0) /
        employees.length
      : 100;

  function getEmployeeStats(emp: Employee) {
    const empTasks = allTasks.filter((t) => t.assignee_id === emp.id);
    const empActive = empTasks.filter(
      (t) => t.status !== "done" && t.status !== "cancelled"
    );
    const empDone = empTasks.filter((t) => t.status === "done");
    const empOverdue = empActive.filter(
      (t) => t.due_at && new Date(t.due_at) < new Date()
    );
    const empBlocked = empActive.filter((t) => t.status === "blocked");
    const avgProgress =
      empActive.length > 0
        ? empActive.reduce((s, t) => s + t.progress_percent, 0) /
          empActive.length
        : 0;

    return {
      total: empTasks.length,
      active: empActive.length,
      done: empDone.length,
      overdue: empOverdue.length,
      blocked: empBlocked.length,
      avgProgress: Math.round(avgProgress),
    };
  }

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/agents/task-analyzer", { method: "POST" });
      const data = await res.json();
      if (data.analysis) {
        setAnalysis(data.analysis);
      }
    } catch {
      // silently fail
    } finally {
      setAnalyzing(false);
    }
  }

  // Auto-run analysis on mount if not cached
  useEffect(() => {
    if (!analysis && employees.length > 0 && tasks.length > 0) {
      runAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.length, tasks.length]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-zinc-100 mb-1">
            Team Performance
          </h2>
          <p className="text-sm text-zinc-500">
            Task metrics, employee stats, and AI analysis
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={analyzing}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 rounded-lg text-zinc-300 transition-colors disabled:opacity-50"
        >
          {analyzing ? (
            <Loader size={14} className="animate-spin" />
          ) : (
            <Brain size={14} />
          )}
          {analyzing ? "Analyzing..." : "Run AI Analysis"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Total Tasks" value={totalTasks} />
        <StatCard
          label="Completed"
          value={doneTasks.length}
          color="text-emerald-400"
        />
        <StatCard
          label="Overdue"
          value={overdueTasks.length}
          color={overdueTasks.length > 0 ? "text-red-400" : "text-zinc-100"}
        />
        <StatCard
          label="Blocked"
          value={blockedTasks.length}
          color={blockedTasks.length > 0 ? "text-orange-400" : "text-zinc-100"}
        />
        <StatCard
          label="On-Time Rate"
          value={`${onTimeRate.toFixed(0)}%`}
          color={
            onTimeRate >= 80 ? "text-emerald-400" : "text-yellow-400"
          }
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Avg Variance"
          value={`${avgVariance.toFixed(1)}x`}
          sub="actual / estimated"
          color={
            avgVariance <= 1.2 ? "text-emerald-400" : "text-yellow-400"
          }
        />
        <StatCard
          label="Active"
          value={activeTasks.length}
          sub="in progress now"
        />
        <StatCard
          label="Team Size"
          value={employees.length}
          sub="active members"
        />
      </div>

      {/* AI Analysis Panel */}
      {analysis && (
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Brain size={16} className="text-purple-400" />
            AI Analysis
          </div>

          <p className="text-sm text-zinc-400 leading-relaxed">
            {analysis.summary}
          </p>

          <div className="grid grid-cols-2 gap-4">
            {analysis.bottlenecks.length > 0 && (
              <div>
                <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">
                  Bottlenecks
                </div>
                <ul className="space-y-1">
                  {analysis.bottlenecks.map((b, i) => (
                    <li
                      key={i}
                      className="text-sm text-red-400/80 flex items-start gap-1.5"
                    >
                      <AlertTriangle
                        size={12}
                        className="mt-0.5 shrink-0"
                      />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.recommendations.length > 0 && (
              <div>
                <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">
                  Recommendations
                </div>
                <ul className="space-y-1">
                  {analysis.recommendations.map((r, i) => (
                    <li
                      key={i}
                      className="text-sm text-emerald-400/80 flex items-start gap-1.5"
                    >
                      <TrendingUp
                        size={12}
                        className="mt-0.5 shrink-0"
                      />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {analysis.risk_tasks.length > 0 && (
            <div>
              <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">
                At-Risk Tasks
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.risk_tasks.map((t, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 text-xs bg-red-500/10 border border-red-500/20 rounded-lg text-red-400"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-6 text-xs text-zinc-500 pt-2 border-t border-zinc-800/50">
            <span>
              Workload: {analysis.workload_balance}
            </span>
            <span>
              Velocity: {analysis.estimated_team_velocity}
            </span>
          </div>
        </div>
      )}

      {/* Employee Performance Table */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800/50">
              <th className="text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Employee
              </th>
              <th className="text-center text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Workload
              </th>
              <th className="text-center text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Tasks Done
              </th>
              <th className="text-center text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Overdue
              </th>
              <th className="text-center text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Avg Progress
              </th>
              <th className="text-center text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                On-Time
              </th>
              <th className="text-center text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Variance
              </th>
              <th className="text-center text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Avg Response
              </th>
              <th className="text-center text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const stats = getEmployeeStats(emp);
              const trendGood = emp.on_time_percentage >= 85 && emp.avg_variance_ratio <= 1.2;
              return (
                <tr
                  key={emp.id}
                  className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-medium text-zinc-400 border border-zinc-700/50">
                        {getInitials(emp.name)}
                      </div>
                      <div>
                        <div className="text-sm text-zinc-200">
                          {displayName(emp)}
                        </div>
                        <div className="text-[11px] text-zinc-600">
                          {emp.role}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <WorkloadBar
                        active={stats.active}
                        total={stats.total}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-zinc-300 tabular-nums">
                    {emp.tasks_completed}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "text-sm tabular-nums",
                        stats.overdue > 0
                          ? "text-red-400"
                          : "text-zinc-600"
                      )}
                    >
                      {stats.overdue}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-zinc-400 tabular-nums">
                      {stats.avgProgress}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "text-sm tabular-nums",
                        emp.on_time_percentage >= 85
                          ? "text-emerald-400"
                          : emp.on_time_percentage >= 70
                          ? "text-yellow-400"
                          : "text-red-400"
                      )}
                    >
                      {emp.on_time_percentage.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <VarianceBar ratio={emp.avg_variance_ratio} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-zinc-400 tabular-nums">
                    {emp.avg_response_minutes.toFixed(0)}m
                  </td>
                  <td className="px-4 py-3 text-center">
                    {trendGood ? (
                      <TrendingUp
                        size={14}
                        className="text-emerald-400 mx-auto"
                      />
                    ) : (
                      <TrendingDown
                        size={14}
                        className="text-yellow-400 mx-auto"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
