import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logAgentActivity } from "@/lib/slack";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
);

// Priority weights for effective load calculation
const PRIORITY_WEIGHT: Record<string, number> = { P0: 4, P1: 3, P2: 2, P3: 1 };

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

interface TaskWithAssignee {
  id: string;
  title: string;
  status: string;
  priority: string;
  progress_percent: number;
  ai_estimate_hours: number | null;
  actual_hours: number | null;
  due_at: string | null;
  started_at: string | null;
  created_at: string;
  assignee_id: string | null;
  last_ping_at: string | null;
  last_response_at: string | null;
  assignee?: {
    id: string;
    name: string;
    nickname: string | null;
    avg_variance_ratio: number;
    on_time_percentage: number;
    avg_response_minutes: number;
  };
}

function computeRiskScore(task: TaskWithAssignee): { score: number; factors: string[] } {
  const factors: string[] = [];
  let riskPoints = 0;
  const now = Date.now();

  // Factor 1: Time pressure (0-30 points)
  if (task.due_at) {
    const hoursUntilDue = (new Date(task.due_at).getTime() - now) / 3600000;
    if (hoursUntilDue < 0) {
      riskPoints += 30;
      factors.push(`Overdue by ${Math.abs(Math.round(hoursUntilDue))}h`);
    } else if (hoursUntilDue < 4) {
      riskPoints += 25;
      factors.push(`Due in ${Math.round(hoursUntilDue)}h`);
    } else if (hoursUntilDue < 24) {
      riskPoints += 15;
      factors.push("Due within 24h");
    }
  }

  // Factor 2: Progress gap (0-25 points)
  if (task.ai_estimate_hours && task.started_at) {
    const elapsedHours = (now - new Date(task.started_at).getTime()) / 3600000;
    const varianceRatio = task.assignee?.avg_variance_ratio || 1.0;
    const calibratedEstimate = task.ai_estimate_hours * varianceRatio;
    const expectedProgress = Math.min((elapsedHours / calibratedEstimate) * 100, 100);
    const gap = expectedProgress - task.progress_percent;

    if (gap > 40) {
      riskPoints += 25;
      factors.push(`Progress ${Math.round(gap)}% behind expected`);
    } else if (gap > 20) {
      riskPoints += 15;
      factors.push(`Progress ${Math.round(gap)}% behind expected`);
    } else if (gap > 10) {
      riskPoints += 8;
    }
  }

  // Factor 3: Assignee reliability (0-20 points)
  if (task.assignee) {
    if (task.assignee.on_time_percentage < 70) {
      riskPoints += 20;
      factors.push(`Assignee on-time rate: ${task.assignee.on_time_percentage}%`);
    } else if (task.assignee.on_time_percentage < 85) {
      riskPoints += 10;
    }

    if (task.assignee.avg_variance_ratio > 1.5) {
      riskPoints += 10;
      factors.push(`High variance ratio: ${task.assignee.avg_variance_ratio}x`);
    }
  }

  // Factor 4: Responsiveness (0-15 points)
  if (task.last_ping_at && !task.last_response_at) {
    const hoursSincePing = (now - new Date(task.last_ping_at).getTime()) / 3600000;
    if (hoursSincePing > 4) {
      riskPoints += 15;
      factors.push(`No response for ${Math.round(hoursSincePing)}h`);
    } else if (hoursSincePing > 1) {
      riskPoints += 8;
    }
  }

  // Factor 5: Priority urgency (0-10 points)
  if (task.priority === "P0") riskPoints += 10;
  else if (task.priority === "P1") riskPoints += 5;

  // Factor 6: Blocked status (flat 15 points)
  if (task.status === "blocked") {
    riskPoints += 15;
    factors.push("Task is blocked");
  }

  // Normalize to 0-100
  const score = Math.min(Math.round(sigmoid((riskPoints - 30) / 15) * 100), 100);

  return { score, factors };
}

export async function POST() {
  // Fetch active tasks with assignee data
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*, assignee:employees!assignee_id(id, name, nickname, avg_variance_ratio, on_time_percentage, avg_response_minutes)")
    .in("status", ["pending", "acknowledged", "in_progress", "blocked"]);

  if (error) {
    return NextResponse.json({ message: `DB error: ${error.message}` }, { status: 500 });
  }

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ message: "No active tasks", risk_tasks: [] });
  }

  // Compute risk scores
  const scoredTasks = (tasks as unknown as TaskWithAssignee[]).map((task) => {
    const risk = computeRiskScore(task);
    return { ...task, risk_score: risk.score, risk_factors: risk.factors };
  });

  // Sort by risk (highest first)
  scoredTasks.sort((a, b) => b.risk_score - a.risk_score);

  // High-risk tasks (score >= 60)
  const highRisk = scoredTasks.filter((t) => t.risk_score >= 60);

  // Store risk alerts as insights
  for (const task of highRisk) {
    await supabase.from("ai_insights").insert({
      type: "risk_alert",
      task_id: task.id,
      employee_id: task.assignee_id,
      message: `High risk (${task.risk_score}%): "${task.title}" — ${task.risk_factors.join(", ")}`,
      metadata: { risk_score: task.risk_score, factors: task.risk_factors },
      status: "pending",
    });
  }

  // Workload imbalance detection
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, nickname")
    .eq("is_active", true);

  const workloads: Record<string, { name: string; load: number; taskCount: number }> = {};
  for (const emp of employees || []) {
    workloads[emp.id] = { name: emp.nickname || emp.name.split(" ")[0], load: 0, taskCount: 0 };
  }

  for (const task of scoredTasks) {
    if (task.assignee_id && workloads[task.assignee_id]) {
      const remainingHours = task.ai_estimate_hours
        ? task.ai_estimate_hours * (1 - task.progress_percent / 100)
        : 4; // default 4h if no estimate
      const weight = PRIORITY_WEIGHT[task.priority] || 2;
      workloads[task.assignee_id].load += remainingHours * weight;
      workloads[task.assignee_id].taskCount++;
    }
  }

  const loads = Object.values(workloads).filter((w) => w.taskCount > 0);
  const avgLoad = loads.length > 0 ? loads.reduce((s, w) => s + w.load, 0) / loads.length : 0;
  const proposals: Array<{ from: string; to: string; reasoning: string }> = [];

  // Find overloaded and underloaded people
  const overloaded = Object.entries(workloads).filter(([, w]) => w.load > avgLoad * 2 && avgLoad > 0);
  const underloaded = Object.entries(workloads).filter(([, w]) => w.load < avgLoad * 0.5);

  for (const [overEmpId, overW] of overloaded) {
    for (const [underEmpId, underW] of underloaded) {
      // Find a transferable task (lowest priority from overloaded person)
      const transferable = scoredTasks
        .filter((t) => t.assignee_id === overEmpId && t.status === "pending")
        .sort((a, b) => (PRIORITY_WEIGHT[a.priority] || 0) - (PRIORITY_WEIGHT[b.priority] || 0));

      if (transferable.length > 0) {
        const task = transferable[0];
        proposals.push({
          from: overW.name,
          to: underW.name,
          reasoning: `Move "${task.title}" from ${overW.name} (${overW.load.toFixed(0)}h load) to ${underW.name} (${underW.load.toFixed(0)}h load)`,
        });

        // Create proposal
        await supabase.from("ai_proposals").insert({
          agent_id: "risk-predictor",
          action_type: "reassign",
          target_task_id: task.id,
          proposed_changes: { new_assignee_id: underEmpId, old_assignee_id: overEmpId },
          reasoning: `${overW.name} is overloaded (${overW.load.toFixed(0)}h effective load vs ${avgLoad.toFixed(0)}h avg). ${underW.name} has capacity (${underW.load.toFixed(0)}h load).`,
          status: "pending",
        });
      }
    }
  }

  // Log to Slack
  if (highRisk.length > 0 || proposals.length > 0) {
    const sections: string[] = [];

    if (highRisk.length > 0) {
      sections.push(
        `:warning: *High Risk Tasks (${highRisk.length})*\n` +
        highRisk.slice(0, 5).map((t) => {
          const name = t.assignee?.nickname || t.assignee?.name || "unassigned";
          return `> :red_circle: *"${t.title}"* [${t.priority}] — ${name} — risk ${t.risk_score}% (${t.risk_factors.slice(0, 2).join(", ")})`;
        }).join("\n")
      );
    }

    if (proposals.length > 0) {
      sections.push(
        `:scales: *Rebalancing Suggestions*\n` +
        proposals.map((p) => `> ${p.reasoning}`).join("\n")
      );
    }

    await logAgentActivity(
      "Risk Predictor",
      `${highRisk.length} high-risk task${highRisk.length !== 1 ? "s" : ""}, ${proposals.length} rebalancing proposal${proposals.length !== 1 ? "s" : ""}`,
      sections.join("\n\n")
    );
  }

  return NextResponse.json({
    message: `Analyzed ${scoredTasks.length} tasks: ${highRisk.length} high-risk, ${proposals.length} rebalancing proposals`,
    risk_tasks: scoredTasks.slice(0, 10).map((t) => ({
      id: t.id,
      title: t.title,
      risk_score: t.risk_score,
      risk_factors: t.risk_factors,
      assignee: t.assignee?.nickname || t.assignee?.name,
    })),
    proposals,
    workloads: Object.entries(workloads).map(([id, w]) => ({ id, ...w })),
  });
}
