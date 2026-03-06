import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendSlackDM, logAgentActivity } from "@/lib/slack";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
);

export async function POST() {
  const now = new Date();
  const in4h = new Date(now.getTime() + 4 * 3600000);
  const in24h = new Date(now.getTime() + 24 * 3600000);

  // Find tasks with upcoming deadlines
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*, assignee:employees!assignee_id(name, nickname)")
    .in("status", ["pending", "acknowledged", "in_progress", "blocked"])
    .not("due_at", "is", null)
    .lte("due_at", in24h.toISOString())
    .order("due_at");

  if (error) {
    return NextResponse.json(
      { message: `DB error: ${error.message}` },
      { status: 500 }
    );
  }

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({
      message: "No upcoming deadlines",
      warnings: [],
    });
  }

  const warnings: Array<{
    task_id: string;
    title: string;
    assignee: string;
    due_at: string;
    urgency: "overdue" | "critical" | "warning";
    hours_remaining: number;
  }> = [];

  for (const task of tasks) {
    const dueDate = new Date(task.due_at);
    const hoursRemaining = (dueDate.getTime() - now.getTime()) / 3600000;
    const assignee = task.assignee as Record<string, unknown> | null;
    const name = assignee
      ? (assignee.nickname as string) || (assignee.name as string)
      : "unassigned";

    let urgency: "overdue" | "critical" | "warning";
    if (hoursRemaining < 0) {
      urgency = "overdue";
    } else if (dueDate <= in4h) {
      urgency = "critical";
    } else {
      urgency = "warning";
    }

    warnings.push({
      task_id: task.id,
      title: task.title,
      assignee: name,
      due_at: task.due_at,
      urgency,
      hours_remaining: Math.round(hoursRemaining * 10) / 10,
    });

    // Log warning for overdue and critical
    if (urgency === "overdue" || urgency === "critical") {
      await supabase.from("task_activity").insert({
        task_id: task.id,
        activity_type: "due_date_changed",
        message:
          urgency === "overdue"
            ? `OVERDUE: Task is ${Math.abs(Math.round(hoursRemaining))}h past deadline`
            : `WARNING: Task due in ${Math.round(hoursRemaining)}h`,
        metadata: { urgency, hours_remaining: hoursRemaining },
      });
    }
  }

  const overdue = warnings.filter((w) => w.urgency === "overdue").length;
  const critical = warnings.filter((w) => w.urgency === "critical").length;

  // DM assignees about overdue/critical tasks
  for (const task of tasks) {
    const dueDate = new Date(task.due_at);
    const hoursRemaining = (dueDate.getTime() - now.getTime()) / 3600000;
    const assignee = task.assignee as Record<string, unknown> | null;
    if (!assignee?.slack_id) continue;

    const name = (assignee.nickname || assignee.name) as string;
    if (hoursRemaining < 0) {
      await sendSlackDM(
        assignee.slack_id as string,
        `Hey ${name}, just a heads up — *"${task.title}"* was due ${Math.abs(Math.round(hoursRemaining))}h ago. Can you push an update or let me know where things stand? Let's get this one wrapped up.`
      );
    } else if (hoursRemaining <= 4) {
      await sendSlackDM(
        assignee.slack_id as string,
        `${name}, *"${task.title}"* is due in about ${Math.round(hoursRemaining)}h — you're in the home stretch! Let me know if you need anything to get it over the line.`
      );
    }
  }

  // Log summary to Slack channel
  if (warnings.length > 0) {
    const overdueItems = warnings.filter((w) => w.urgency === "overdue");
    const criticalItems = warnings.filter((w) => w.urgency === "critical");
    const warningItems = warnings.filter((w) => w.urgency === "warning");

    const sections: string[] = [];

    if (overdueItems.length > 0) {
      sections.push(
        `:red_circle: *Overdue — needs immediate attention*\n` +
        overdueItems.map((w) => `> :small_red_triangle: *"${w.title}"* — _${w.assignee}_ is *${Math.abs(w.hours_remaining)}h past deadline*`).join("\n")
      );
    }

    if (criticalItems.length > 0) {
      sections.push(
        `:large_orange_circle: *Due very soon*\n` +
        criticalItems.map((w) => `> :hourglass_flowing_sand: *"${w.title}"* — _${w.assignee}_ has *${w.hours_remaining}h left*`).join("\n")
      );
    }

    if (warningItems.length > 0) {
      sections.push(
        `:large_blue_circle: *Heads up — due within 24h*\n` +
        warningItems.map((w) => `> :clock3: "${w.title}" — _${w.assignee}_, ${w.hours_remaining}h remaining`).join("\n")
      );
    }

    const headline = overdue > 0
      ? `${overdue} task${overdue > 1 ? "s" : ""} overdue, ${critical} critical`
      : critical > 0
        ? `${critical} task${critical > 1 ? "s" : ""} due soon — clock's ticking`
        : `${warnings.length} deadline${warnings.length > 1 ? "s" : ""} on the horizon — all clear for now`;

    await logAgentActivity("Deadline Guardian", headline, sections.join("\n\n"));
  }

  return NextResponse.json({
    message: `Found ${warnings.length} tasks with upcoming deadlines: ${overdue} overdue, ${critical} critical`,
    warnings,
    overdue,
    critical,
  });
}
