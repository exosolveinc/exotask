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
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
  }

  const { query } = await req.json();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  // Gather all data context
  const [{ data: employees }, { data: tasks }, proposalsResult] = await Promise.all([
    supabase.from("employees").select("*").eq("is_active", true),
    supabase.from("tasks").select("*, assignee:employees!assignee_id(name, nickname)").is("parent_id", null),
    supabase.from("ai_proposals").select("*").eq("status", "pending"),
  ]);
  const proposals = proposalsResult?.data || [];

  const now = new Date();
  const taskSummary = (tasks || []).map((t) => {
    const assigneeName = t.assignee?.nickname || t.assignee?.name || "unassigned";
    const overdue = t.due_at && new Date(t.due_at) < now && t.status !== "done" ? " OVERDUE" : "";
    return `- "${t.title}" [${t.priority}] ${t.status} → ${assigneeName} (${t.progress_percent}%${overdue})`;
  }).join("\n");

  const empSummary = (employees || []).map((e) => {
    const activeCount = (tasks || []).filter((t) => t.assignee_id === e.id && t.status !== "done" && t.status !== "cancelled").length;
    return `- ${e.name} (${e.nickname || "-"}): ${e.role}, ${activeCount} active, ${e.tasks_completed} done, ${e.on_time_percentage}% on-time, variance ${e.avg_variance_ratio}x, avg response ${e.avg_response_minutes}m`;
  }).join("\n");

  const groq = new Groq({ apiKey: groqKey });

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 500,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an AI assistant for ExoTask, a task management system. Answer questions about team performance, workload, tasks, and risks.

Current datetime: ${now.toISOString()}

Tasks:
${taskSummary}

Team:
${empSummary}

Pending AI proposals: ${(proposals as unknown[])?.length || 0}

Return JSON:
{
  "answer": "<concise markdown answer>",
  "type": "info|warning|success",
  "highlights": [{"label": "<metric>", "value": "<value>"}]
}

Be concise, direct, and data-driven. Use numbers from the actual data above.`,
      },
      { role: "user", content: query },
    ],
  });

  try {
    const text = completion.choices[0]?.message?.content || "";
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "Failed to process query" }, { status: 500 });
  }
}
