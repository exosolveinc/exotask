import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { logAgentActivity } from "@/lib/slack";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
);

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "placeholder") {
    return NextResponse.json(
      { message: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Fetch recent activity
  const { data: activity } = await supabase
    .from("task_activity")
    .select("*, task:tasks(title, priority, status, assignee_id)")
    .gte("created_at", yesterday.toISOString())
    .order("created_at", { ascending: false });

  // Fetch all active tasks
  const { data: activeTasks } = await supabase
    .from("tasks")
    .select("*, assignee:employees!assignee_id(name, nickname)")
    .in("status", ["pending", "acknowledged", "in_progress", "blocked", "review"]);

  // Fetch employees
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, nickname, tasks_completed, on_time_percentage, avg_variance_ratio")
    .eq("is_active", true);

  const activitySummary = (activity || [])
    .map(
      (a: Record<string, unknown>) => {
        const task = a.task as Record<string, unknown> | null;
        return `- [${a.activity_type}] ${a.message}${task ? ` (task: "${task.title}", ${task.priority}, ${task.status})` : ""}`;
      }
    )
    .join("\n");

  const tasksSummary = (activeTasks || [])
    .map((t: Record<string, unknown>) => {
      const assignee = t.assignee as Record<string, unknown> | null;
      const name = assignee ? (assignee.nickname || assignee.name) : "Unassigned";
      return `- "${t.title}" [${t.priority}] ${t.status} → ${name}, progress: ${t.progress_percent}%${t.due_at ? `, due: ${t.due_at}` : ""}`;
    })
    .join("\n");

  const teamSummary = (employees || [])
    .map(
      (e: Record<string, unknown>) =>
        `- ${e.name}: ${e.tasks_completed} completed, ${e.on_time_percentage}% on-time, variance ${e.avg_variance_ratio}x`
    )
    .join("\n");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You're ExoTask's daily standup host — a warm, sharp PM who makes status updates feel like a conversation, not a chore.

STRICT FORMAT — follow this template exactly:

:coffee: *Good morning, team!*
<1-2 line greeting — reference the day, add a witty remark or pop culture nod. Vary it every time.>

:white_check_mark: *Yesterday's Wins*
${(activity || []).length > 0 ? "> List what got completed or moved forward. Use > quote blocks." : "> _No completed tasks yesterday — that's worth noting._"}

:clipboard: *Today's Board*
<For each active task, use this format:>
> :large_blue_circle: *Task Name* [Priority]
> _Owner_ · Progress% · Status · Due date
<Use :red_circle: for blocked/overdue, :large_orange_circle: for at-risk, :large_blue_circle: for on-track>

:warning: *Blockers & Red Flags*
> <Any blocked tasks, overdue items, or people who've gone quiet. Be specific.>
<If none, say so — that's a good sign>

:dart: *Today's Priorities*
:one: <Specific action for a specific person>
:two: <Specific action>
:three: <Specific action if needed>

_<End with a brief motivational one-liner in italics>_

FORMAT RULES:
- Use Slack mrkdwn: *bold*, _italic_, > for quote blocks, :emoji: codes
- Use colored circle emoji to indicate task health
- Separate sections with double newlines (critical for layout)
- Be specific — name people, name tasks, give numbers and percentages
- Keep it under 600 words
- NO markdown headers with #, NO code fences, NO horizontal rules with ---

DATA:

Last 24h Activity:
${activitySummary || "No activity recorded"}

Active Tasks:
${tasksSummary || "No active tasks"}

Team Stats:
${teamSummary || "No team data"}

Respond with ONLY the formatted Slack message. Nothing else.`,
      },
    ],
  });

  const digestText =
    message.content[0].type === "text" ? message.content[0].text.trim() : "";

  // Log the digest as activity
  await supabase.from("task_activity").insert({
    task_id: null,
    activity_type: "comment",
    message: `Daily digest generated`,
    metadata: { generated_at: now.toISOString() },
  });

  // Post digest to Slack channel
  await logAgentActivity("Daily Digest", "Morning standup", digestText);

  return NextResponse.json({
    message: "Daily digest posted",
    digest: digestText,
  });
}
