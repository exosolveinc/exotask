import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendSlackDM, logAgentActivity } from "@/lib/slack";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "placeholder"
);

const ESCALATION_ORDER = ["slack", "whatsapp", "phone", "manager"] as const;
const WAIT_MINUTES = 15;

// P0 tasks get pinged more urgently
const PRIORITY_MULTIPLIER: Record<string, number> = {
  P0: 0.5,  // half the normal interval
  P1: 0.75,
  P2: 1.0,
  P3: 1.5,  // less frequent for low priority
};

export async function POST() {
  const now = new Date();

  // Find ALL active tasks (not just tracker_enabled) — agent proactively monitors
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*, assignee:employees!assignee_id(*)")
    .in("status", ["pending", "acknowledged", "in_progress", "blocked"]);

  if (error) {
    return NextResponse.json(
      { message: `DB error: ${error.message}` },
      { status: 500 }
    );
  }

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ message: "No active tasks", checked: 0 });
  }

  // Fetch manager for escalations
  const { data: managers } = await supabase
    .from("employees")
    .select("id, name, nickname, slack_id")
    .eq("role", "manager")
    .eq("is_active", true);
  const manager = managers?.[0] as Record<string, unknown> | undefined;

  let pinged = 0;
  let escalated = 0;
  let skipped = 0;
  let staleProdded = 0;

  for (const task of tasks) {
    const assignee = task.assignee as Record<string, unknown> | null;
    if (!assignee) {
      // Unassigned active task — flag it
      if (!task.last_ping_at || hoursSince(task.last_ping_at) > 4) {
        await supabase.from("task_activity").insert({
          task_id: task.id,
          activity_type: "tracker_ping",
          message: "Unassigned task detected — needs an owner",
          metadata: { reason: "no_assignee" },
        });
        if (manager?.slack_id) {
          await sendSlackDM(
            manager.slack_id as string,
            `*Unassigned task:* "${task.title}" [${task.priority}] has no assignee. Please assign someone.`
          );
        }
      }
      skipped++;
      continue;
    }

    // For tracker_enabled tasks, use the configured interval
    // For non-tracker tasks, only prod if stale (no activity in 24h+ for in_progress)
    if (!task.tracker_enabled) {
      if (task.status === "in_progress") {
        const lastActivity = task.last_response_at || task.started_at || task.created_at;
        const hoursSinceActivity = hoursSince(lastActivity);
        // Prod if no activity for 24h (P0/P1) or 48h (P2/P3)
        const threshold = task.priority === "P0" || task.priority === "P1" ? 24 : 48;
        if (hoursSinceActivity > threshold && (!task.last_ping_at || hoursSince(task.last_ping_at) > 12)) {
          const name = (assignee.nickname || (assignee.name as string).split(" ")[0]) as string;
          if (assignee.slack_id) {
            await sendSlackDM(
              assignee.slack_id as string,
              `Hey ${name}, *"${task.title}"* has been in progress for ${Math.round(hoursSinceActivity)}h with no updates. How's it going?`
            );
          }
          await supabase.from("tasks").update({ last_ping_at: now.toISOString() }).eq("id", task.id);
          await supabase.from("task_activity").insert({
            task_id: task.id,
            activity_type: "tracker_ping",
            message: `Stale task: prodded ${name} (${Math.round(hoursSinceActivity)}h since last activity)`,
            metadata: { reason: "stale", hours_since_activity: hoursSinceActivity },
          });
          staleProdded++;
        }
      }
      skipped++;
      continue;
    }

    // --- Tracker-enabled tasks: full escalation logic ---
    const multiplier = PRIORITY_MULTIPLIER[task.priority] || 1.0;
    const effectiveInterval = task.tracker_interval_minutes * multiplier;

    if (task.last_ping_at) {
      const minutesSincePing = (now.getTime() - new Date(task.last_ping_at).getTime()) / 60000;
      if (minutesSincePing < effectiveInterval) {
        skipped++;
        continue;
      }
    }

    // Check if employee responded since last ping
    const hasResponded =
      task.last_response_at &&
      task.last_ping_at &&
      new Date(task.last_response_at) > new Date(task.last_ping_at);

    if (hasResponded) {
      await supabase
        .from("tasks")
        .update({ current_escalation: "slack" })
        .eq("id", task.id);
      skipped++;
      continue;
    }

    // No response — ping at current level
    const currentLevel = task.current_escalation as (typeof ESCALATION_ORDER)[number] | undefined;
    const level = currentLevel || "slack";
    const name = (assignee.nickname || (assignee.name as string).split(" ")[0]) as string;

    // Build context-aware message based on task state
    const msg = buildPingMessage(name, task.title, task.priority, task.status, task.progress_percent, task.due_at);
    const sent = await sendNotification(level, assignee, name, msg, manager);

    await supabase.from("task_activity").insert({
      task_id: task.id,
      activity_type: "tracker_ping",
      message: `Pinged ${name} via ${level}${sent ? "" : " (failed)"}`,
      metadata: { escalation_level: level, delivered: sent, priority: task.priority },
    });

    await supabase
      .from("tasks")
      .update({ last_ping_at: now.toISOString() })
      .eq("id", task.id);

    pinged++;

    // Escalate if no response after WAIT_MINUTES
    if (task.last_ping_at) {
      const timeSinceLastPing = (now.getTime() - new Date(task.last_ping_at).getTime()) / 60000;
      // P0 escalates faster
      const escalateAfter = task.priority === "P0" ? WAIT_MINUTES * 0.5 : WAIT_MINUTES;
      if (timeSinceLastPing >= escalateAfter && !hasResponded) {
        const currentIndex = ESCALATION_ORDER.indexOf(level);
        if (currentIndex < ESCALATION_ORDER.length - 1) {
          const nextLevel = ESCALATION_ORDER[currentIndex + 1];
          await supabase
            .from("tasks")
            .update({ current_escalation: nextLevel })
            .eq("id", task.id);

          await supabase.from("task_activity").insert({
            task_id: task.id,
            activity_type: "escalation",
            message: `Escalated from ${level} to ${nextLevel}`,
            metadata: { from: level, to: nextLevel },
          });

          escalated++;
        }
      }
    }
  }

  const summary = `Checked ${tasks.length} tasks: ${pinged} pinged, ${escalated} escalated, ${staleProdded} stale prods, ${skipped} skipped`;

  if (pinged > 0 || escalated > 0 || staleProdded > 0) {
    const sections: string[] = [];

    if (pinged > 0) {
      const pingedTasks = tasks.filter((t) => t.assignee && t.tracker_enabled);
      sections.push(
        `:speech_balloon: *Pinged for updates*\n` +
        pingedTasks.map((t) => {
          const a = t.assignee as Record<string, unknown>;
          const name = (a.nickname || a.name) as string;
          const level = t.current_escalation || "slack";
          const icon = level === "slack" ? ":slack:" : level === "whatsapp" ? ":phone:" : level === "manager" ? ":bust_in_silhouette:" : ":mega:";
          return `> ${icon} *"${t.title}"* [${t.priority}] — nudged _${name}_ via ${level} · ${t.progress_percent}% done`;
        }).join("\n")
      );
    }

    if (escalated > 0) {
      sections.push(`:arrow_up: *Escalations* — ${escalated} task${escalated > 1 ? "s" : ""} moved up the chain. No response from assignees.`);
    }

    if (staleProdded > 0) {
      sections.push(`:eyes: *Stale Prods* — ${staleProdded} task${staleProdded > 1 ? "s" : ""} went quiet. Gave them a friendly nudge.`);
    }

    const headline = escalated > 0
      ? `${pinged} pinged, ${escalated} escalated — some folks are going dark`
      : staleProdded > 0
        ? `${pinged} pinged, ${staleProdded} stale tasks prodded — keeping everyone honest`
        : `${pinged} update request${pinged > 1 ? "s" : ""} sent — routine check-in`;

    await logAgentActivity("Update Checker", headline, sections.join("\n\n"));
  }

  return NextResponse.json({
    message: summary,
    checked: tasks.length,
    pinged,
    escalated,
    stale_prodded: staleProdded,
    skipped,
  });
}

function hoursSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 3600000;
}

function buildPingMessage(
  name: string,
  title: string,
  priority: string,
  status: string,
  progress: number,
  dueAt: string | null
): string {
  const urgencyPrefix = priority === "P0" ? "*URGENT* " : priority === "P1" ? "*Important* " : "";
  const progressNote = progress > 0 ? ` (${progress}% done)` : "";

  let deadlineNote = "";
  if (dueAt) {
    const hoursLeft = (new Date(dueAt).getTime() - Date.now()) / 3600000;
    if (hoursLeft < 0) deadlineNote = ` — *OVERDUE by ${Math.abs(Math.round(hoursLeft))}h*`;
    else if (hoursLeft < 4) deadlineNote = ` — due in ${Math.round(hoursLeft)}h`;
    else if (hoursLeft < 24) deadlineNote = ` — due today`;
  }

  if (status === "pending") {
    return `${urgencyPrefix}Hey ${name}, *"${title}"* is still pending. Can you start on it?${deadlineNote}`;
  }
  if (status === "blocked") {
    return `${urgencyPrefix}${name}, *"${title}"* is blocked${progressNote}. What's the blocker? Need help?${deadlineNote}`;
  }
  return `${urgencyPrefix}Hey ${name}, how's *"${title}"* going?${progressNote}${deadlineNote} Quick status update?`;
}

async function sendNotification(
  level: string,
  assignee: Record<string, unknown>,
  name: string,
  message: string,
  manager?: Record<string, unknown>
): Promise<boolean> {
  switch (level) {
    case "slack": {
      const slackId = assignee.slack_id as string | null;
      if (!slackId) return false;
      return sendSlackDM(slackId, message);
    }

    case "whatsapp": {
      // TODO: Twilio WhatsApp
      console.log(`[Update Checker] WhatsApp to ${name} (not yet integrated)`);
      return false;
    }

    case "phone": {
      // TODO: Twilio Voice
      console.log(`[Update Checker] Phone call to ${name} (not yet integrated)`);
      return false;
    }

    case "manager": {
      if (manager?.slack_id) {
        return sendSlackDM(
          manager.slack_id as string,
          `*Manager escalation:* ${name} is unresponsive on their task. ${message}`
        );
      }
      console.log(`[Update Checker] Manager notified about ${name} (no manager slack_id)`);
      return false;
    }

    default:
      return false;
  }
}
