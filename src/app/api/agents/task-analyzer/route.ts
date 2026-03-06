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

  // Gather all data
  const [
    { data: employees },
    { data: tasks },
    { data: recentActivity },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("*")
      .eq("is_active", true),
    supabase
      .from("tasks")
      .select("*, assignee:employees!assignee_id(name, nickname)")
      .order("created_at", { ascending: false }),
    supabase
      .from("task_activity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (!employees || !tasks) {
    return NextResponse.json(
      { message: "Failed to fetch data" },
      { status: 500 }
    );
  }

  const now = new Date();
  const activeTasks = tasks.filter(
    (t: Record<string, unknown>) =>
      t.status !== "done" && t.status !== "cancelled"
  );
  const overdueTasks = activeTasks.filter(
    (t: Record<string, unknown>) =>
      t.due_at && new Date(t.due_at as string) < now
  );

  const taskSummary = activeTasks
    .map((t: Record<string, unknown>) => {
      const assignee = t.assignee as Record<string, unknown> | null;
      const name = assignee
        ? (assignee.nickname as string) || (assignee.name as string)
        : "unassigned";
      const due = t.due_at
        ? `due ${new Date(t.due_at as string).toLocaleDateString()}`
        : "no deadline";
      return `- [${t.priority}] "${t.title}" assigned to ${name}, status: ${t.status}, progress: ${t.progress_percent}%, ${due}`;
    })
    .join("\n");

  const teamSummary = employees
    .map(
      (e: Record<string, unknown>) =>
        `- ${e.name}: ${e.role}, ${e.tasks_completed} tasks done, ${e.on_time_percentage}% on-time, variance ${e.avg_variance_ratio}x, active tasks: ${activeTasks.filter((t: Record<string, unknown>) => t.assignee_id === e.id).length}`
    )
    .join("\n");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: `You are ExoTask's senior analyst — sharp, warm, and impossible to fool. You write beautifully formatted Slack reports for a dev team.

Your personality: Think a senior PM who genuinely cares about the team but has zero tolerance for ambiguity. Warm opening, then razor-sharp analysis. A touch of wit — maybe a quick pop-culture reference or metaphor. Never robotic, never generic.

STRICT FORMAT — follow this template exactly:

:zap: *Overall Pulse*
<1-2 sentence vibe check — are we healthy, stressed, coasting? Be specific.>

:rotating_light: *Risks & Bottlenecks*
> :small_red_triangle: <bold the risk> — <who, what task, why it matters>
> :small_red_triangle: <next risk>
<add as many as needed, use > quote blocks for each>

:bar_chart: *Workload Snapshot*
| Team Member | Active | Progress | Status |
<use a simple text table or bullet breakdown showing each person's load>

:dart: *Action Items*
:one: <specific action with a person's name>
:two: <specific action>
:three: <specific action if needed>

_<End with a brief motivational or witty one-liner in italics>_

FORMAT RULES:
- Use Slack mrkdwn: *bold*, _italic_, > for quotes, :emoji: codes
- Use :small_red_triangle: for risk items in > quote blocks
- Use numbered emoji (:one: :two: :three:) for action items
- Separate sections with double newlines (important for layout)
- Keep it under 700 words
- NO markdown headers with #, NO code fences, NO horizontal rules with ---

DATA:

Active Tasks (${activeTasks.length}):
${taskSummary}

Overdue: ${overdueTasks.length}

Team:
${teamSummary}

Recent Activity: ${(recentActivity || []).length} events

Respond with ONLY the formatted Slack message. Nothing else.`,
      },
    ],
  });

  const analysisText =
    message.content[0].type === "text" ? message.content[0].text.trim() : "";

  await logAgentActivity(
    "Task Analyzer",
    `${activeTasks.length} active tasks, ${overdueTasks.length} overdue`,
    analysisText
  );

  return NextResponse.json({
    message: "Analysis complete",
    analysis: analysisText,
    meta: {
      active_tasks: activeTasks.length,
      overdue_tasks: overdueTasks.length,
      team_size: employees.length,
    },
  });
}
