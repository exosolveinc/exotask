import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendSlackDM } from "@/lib/slack";

// Service role client for tracker (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder"
);

const ESCALATION_ORDER = ["slack", "whatsapp", "phone", "manager"] as const;
const WAIT_MINUTES = 15; // wait before escalating

// POST /api/tracker — called by cron (Vercel cron or external)
export async function POST() {
  const now = new Date();

  // Find all tasks that need checking
  const { data: queue } = await supabase
    .from("tracker_queue")
    .select("*, task:tasks(*, assignee:employees!assignee_id(*))")
    .eq("is_active", true)
    .lte("next_check_at", now.toISOString());

  if (!queue || queue.length === 0) {
    return NextResponse.json({ checked: 0 });
  }

  const results = [];

  for (const item of queue) {
    const task = item.task as Record<string, unknown>;
    if (!task) continue;

    const assignee = task.assignee as Record<string, unknown> | null;
    if (!assignee) continue;

    // Check if employee has responded since last ping
    const lastPing = task.last_ping_at as string | null;
    const lastResponse = task.last_response_at as string | null;
    const hasResponded = lastResponse && lastPing && new Date(lastResponse) > new Date(lastPing);

    if (hasResponded) {
      // Reset escalation, schedule next check
      const nextCheck = new Date(now.getTime() + (task.tracker_interval_minutes as number) * 60000);
      await supabase
        .from("tracker_queue")
        .update({
          next_check_at: nextCheck.toISOString(),
          escalation_level: "slack",
          attempts_at_current_level: 0,
        })
        .eq("id", item.id);

      results.push({ task_id: task.id, action: "reset", reason: "responded" });
      continue;
    }

    // No response — escalate
    const currentLevel = item.escalation_level as (typeof ESCALATION_ORDER)[number];
    const currentIndex = ESCALATION_ORDER.indexOf(currentLevel);

    // Send notification at current level
    const notificationSent = await sendNotification(
      currentLevel,
      assignee,
      task
    );

    // Log the ping
    await supabase.from("task_activity").insert({
      task_id: task.id as string,
      activity_type: "tracker_ping",
      message: `Tracker pinged via ${currentLevel}`,
      metadata: { escalation_level: currentLevel, sent: notificationSent },
    });

    await supabase
      .from("tasks")
      .update({ last_ping_at: now.toISOString() })
      .eq("id", task.id as string);

    // After WAIT_MINUTES, if still no response, escalate
    const newAttempts = item.attempts_at_current_level + 1;

    if (newAttempts >= 1 && currentIndex < ESCALATION_ORDER.length - 1) {
      // Escalate to next level
      const nextLevel = ESCALATION_ORDER[currentIndex + 1];
      await supabase
        .from("tracker_queue")
        .update({
          next_check_at: new Date(now.getTime() + WAIT_MINUTES * 60000).toISOString(),
          escalation_level: nextLevel,
          attempts_at_current_level: 0,
        })
        .eq("id", item.id);

      await supabase
        .from("tasks")
        .update({ current_escalation: nextLevel })
        .eq("id", task.id as string);

      await supabase.from("task_activity").insert({
        task_id: task.id as string,
        activity_type: "escalation",
        message: `Escalated to ${nextLevel}`,
        metadata: { from: currentLevel, to: nextLevel },
      });

      results.push({ task_id: task.id, action: "escalated", to: nextLevel });
    } else {
      // Same level, try again
      await supabase
        .from("tracker_queue")
        .update({
          next_check_at: new Date(now.getTime() + WAIT_MINUTES * 60000).toISOString(),
          attempts_at_current_level: newAttempts,
        })
        .eq("id", item.id);

      results.push({ task_id: task.id, action: "pinged", level: currentLevel });
    }
  }

  return NextResponse.json({ checked: queue.length, results });
}

async function sendNotification(
  level: string,
  assignee: Record<string, unknown>,
  task: Record<string, unknown>
): Promise<boolean> {
  const name = assignee.name as string;
  const title = task.title as string;

  switch (level) {
    case "slack": {
      const slackId = assignee.slack_id as string | null;
      if (!slackId) return false;
      return sendSlackDM(
        slackId,
        `Hey ${name}, your task *"${title}"* needs a status update. Please reply or update in ExoTask.`
      );
    }

    case "whatsapp": {
      const whatsapp = assignee.whatsapp as string | null;
      if (!whatsapp) return false;
      // TODO: Integrate Twilio WhatsApp
      // await twilio.messages.create({
      //   from: 'whatsapp:+14155238886',
      //   to: `whatsapp:${whatsapp}`,
      //   body: `${name}, "${title}" needs an update. Please respond on Slack or here.`,
      // });
      console.log(`[Tracker] WhatsApp to ${name}: "${title}"`);
      return true;
    }

    case "phone": {
      const phone = assignee.phone as string | null;
      if (!phone) return false;
      // TODO: Integrate Twilio Voice
      // await twilio.calls.create({
      //   from: '+1...',
      //   to: phone,
      //   twiml: `<Response><Say>Hi ${name}. Your task "${title}" has no update. Please check in.</Say></Response>`,
      // });
      console.log(`[Tracker] Phone call to ${name}: "${title}"`);
      return true;
    }

    case "manager": {
      // TODO: Notify manager
      console.log(`[Tracker] Manager notified about ${name}: "${title}"`);
      return true;
    }

    default:
      return false;
  }
}
