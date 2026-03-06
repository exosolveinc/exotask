import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
);

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "placeholder") {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const { title, description } = await req.json();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Fetch team context
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, nickname, role, avg_variance_ratio, tasks_completed, on_time_percentage")
    .eq("is_active", true);

  const { data: activeTasks } = await supabase
    .from("tasks")
    .select("title, assignee_id, priority, status, ai_estimate_hours")
    .in("status", ["pending", "acknowledged", "in_progress"]);

  const teamContext = (employees || [])
    .map(
      (e) =>
        `- id="${e.id}" ${e.name} (${e.nickname || e.name.split(" ")[0]}): ${e.role}, ${e.tasks_completed} tasks done, ${e.on_time_percentage}% on-time, variance ${e.avg_variance_ratio}x, current active: ${(activeTasks || []).filter((t) => t.assignee_id === e.id).length} tasks`
    )
    .join("\n");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are a task management AI. Given a task title and team context, suggest the best configuration.

Task: "${title}"${description ? `\nDescription: "${description}"` : ""}

Team:
${teamContext}

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "priority": "P0 or P1 or P2 or P3",
  "assignee_id": "<exact id string from team list, or null>",
  "assignee_reason": "<one line why>",
  "estimate_hours": <number>,
  "suggested_deadline_hours": <hours from now>,
  "reasoning": "<one line summary>"
}

Rules:
- P0 = critical/blocking, P1 = important/urgent, P2 = normal, P3 = low/nice-to-have
- Assign to someone with low current workload, good on-time rate, and relevant skills
- Don't assign to managers unless they're the only option
- Estimate hours based on similar task complexity`,
      },
    ],
  });

  try {
    let text =
      message.content[0].type === "text" ? message.content[0].text : "";
    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const suggestion = JSON.parse(text);
    return NextResponse.json(suggestion);
  } catch (e) {
    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    console.error("[AI suggest] Failed to parse:", raw, e);
    return NextResponse.json(
      { error: "Failed to parse AI response", raw },
      { status: 500 }
    );
  }
}
