import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
);

export async function POST(req: Request) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY not configured" },
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

  const groq = new Groq({ apiKey: groqKey });

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 300,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a task management AI. Given a task title and team context, suggest the best configuration. Respond ONLY with valid JSON.`,
      },
      {
        role: "user",
        content: `Task: "${title}"${description ? `\nDescription: "${description}"` : ""}

Team:
${teamContext}

Return JSON:
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
    const text = completion.choices[0]?.message?.content || "";
    const suggestion = JSON.parse(text);
    return NextResponse.json(suggestion);
  } catch (e) {
    const raw = completion.choices[0]?.message?.content || "";
    console.error("[AI suggest] Failed to parse:", raw, e);
    return NextResponse.json(
      { error: "Failed to parse AI response", raw },
      { status: 500 }
    );
  }
}
