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
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const { task_id, title, description } = await req.json();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Fetch team context for smart assignment
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, nickname, role, avg_variance_ratio, tasks_completed, on_time_percentage")
    .eq("is_active", true);

  const { data: activeTasks } = await supabase
    .from("tasks")
    .select("title, assignee_id, priority, status")
    .in("status", ["pending", "acknowledged", "in_progress"]);

  const teamContext = (employees || [])
    .map((e) => {
      const activeCount = (activeTasks || []).filter((t) => t.assignee_id === e.id).length;
      return `- id="${e.id}" ${e.name} (${e.nickname || e.name.split(" ")[0]}): ${e.role}, ${e.tasks_completed} done, ${e.on_time_percentage}% on-time, variance ${e.avg_variance_ratio}x, active: ${activeCount}`;
    })
    .join("\n");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are a senior project manager AI. Decompose this task into subtasks.

Task: "${title}"${description ? `\nDescription: "${description}"` : ""}

Team:
${teamContext}

Return ONLY valid JSON (no markdown):
{
  "subtasks": [
    {
      "title": "<clear subtask title>",
      "estimate_hours": <number>,
      "suggested_assignee_id": "<employee id or null>",
      "suggested_priority": "P0|P1|P2|P3",
      "dependency_index": <index of subtask this depends on, or null>,
      "reasoning": "<why this assignee>"
    }
  ],
  "total_estimate_hours": <sum>,
  "approach_summary": "<1-2 sentences on the decomposition strategy>"
}

Rules:
- Break into 3-7 subtasks (not too granular, not too broad)
- Order subtasks logically (dependencies flow top-down)
- Assign to people with relevant capacity and good on-time rates
- Don't assign to managers unless necessary
- Calibrate estimates: multiply raw estimate by assignee's variance ratio`,
      },
    ],
  });

  try {
    let text = message.content[0].type === "text" ? message.content[0].text : "";
    text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const plan = JSON.parse(text);

    // Store as insight if task_id provided
    if (task_id) {
      await supabase.from("ai_insights").insert({
        type: "decomposition",
        task_id,
        message: plan.approach_summary || "Task decomposition generated",
        metadata: plan,
        status: "pending",
      });
    }

    return NextResponse.json(plan);
  } catch (e) {
    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    console.error("[AI decompose] Failed to parse:", raw, e);
    return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 500 });
  }
}
