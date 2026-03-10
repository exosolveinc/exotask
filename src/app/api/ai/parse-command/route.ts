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

  const { input } = await req.json();
  if (!input) {
    return NextResponse.json({ error: "input is required" }, { status: 400 });
  }

  // Fetch employees for name resolution
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, nickname, role")
    .eq("is_active", true);

  const employeeList = (employees || [])
    .map((e) => `id="${e.id}" name="${e.name}" nickname="${e.nickname || ""}" role="${e.role}"`)
    .join("\n");

  const groq = new Groq({ apiKey: groqKey });
  const now = new Date();

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 300,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You parse natural language task commands. Current datetime: ${now.toISOString()}. Today is ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}.

Team members:
${employeeList}

Return JSON with these fields:
{
  "title": "<clean task title>",
  "assignee_id": "<employee id or null>",
  "priority": "P0|P1|P2|P3",
  "due_at": "<ISO datetime string or null>",
  "description": "<optional description or null>"
}

Rules:
- Extract a clean task title (imperative form, no fluff)
- Resolve names/nicknames to employee IDs. Fuzzy match: "prash" = Prashant, etc.
- Infer priority from urgency words: "urgent/critical/asap/broken" = P0, "important" = P1, "low priority/eventually/nice to have" = P3, default P2
- Parse relative dates: "tomorrow" = tomorrow 9am, "friday" = next friday 9am, "in 2 days" = +2d, "by end of week" = friday 6pm, "next week" = next monday 9am
- If input starts with "/task", strip it first`,
      },
      {
        role: "user",
        content: input,
      },
    ],
  });

  try {
    const text = completion.choices[0]?.message?.content || "";
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "Failed to parse command" }, { status: 500 });
  }
}
