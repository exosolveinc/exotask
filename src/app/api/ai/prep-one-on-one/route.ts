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

  const { employee_id } = await req.json();
  if (!employee_id) {
    return NextResponse.json({ error: "employee_id is required" }, { status: 400 });
  }

  // Fetch employee
  const { data: employee } = await supabase
    .from("employees")
    .select("*")
    .eq("id", employee_id)
    .single();

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Fetch their tasks
  const { data: tasks } = await supabase
    .from("tasks")
    .select("title, status, priority, progress_percent, due_at, ai_estimate_hours, actual_hours, created_at, completed_at")
    .eq("assignee_id", employee_id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch team averages for comparison
  const { data: allEmployees } = await supabase
    .from("employees")
    .select("on_time_percentage, avg_variance_ratio, avg_response_minutes, tasks_completed")
    .eq("is_active", true);

  const teamAvg = {
    on_time: allEmployees ? allEmployees.reduce((s, e) => s + e.on_time_percentage, 0) / allEmployees.length : 0,
    variance: allEmployees ? allEmployees.reduce((s, e) => s + e.avg_variance_ratio, 0) / allEmployees.length : 1,
    response: allEmployees ? allEmployees.reduce((s, e) => s + e.avg_response_minutes, 0) / allEmployees.length : 0,
    completed: allEmployees ? allEmployees.reduce((s, e) => s + e.tasks_completed, 0) / allEmployees.length : 0,
  };

  // Fetch performance snapshots for trends
  const { data: snapshots } = await supabase
    .from("performance_snapshots")
    .select("*")
    .eq("employee_id", employee_id)
    .order("snapshot_date", { ascending: false })
    .limit(14);

  const emp = employee as Record<string, unknown>;
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Generate a 1:1 meeting prep for a manager meeting with this team member.

Employee: ${emp.name} (${emp.role})
- Tasks completed: ${emp.tasks_completed} (team avg: ${teamAvg.completed.toFixed(0)})
- On-time rate: ${emp.on_time_percentage}% (team avg: ${teamAvg.on_time.toFixed(0)}%)
- Variance ratio: ${emp.avg_variance_ratio}x (team avg: ${teamAvg.variance.toFixed(1)}x)
- Avg response time: ${emp.avg_response_minutes}m (team avg: ${teamAvg.response.toFixed(0)}m)

Recent tasks: ${JSON.stringify(tasks || [])}
Performance trend (last 14 days): ${JSON.stringify(snapshots || [])}

Return ONLY valid JSON:
{
  "praise": ["<specific things to praise>"],
  "discuss": ["<areas to discuss diplomatically>"],
  "goals": ["<suggested goals for next sprint>"],
  "risks": ["<risk areas to address>"],
  "talking_points": ["<conversation starters>"],
  "overall_assessment": "<1-2 sentence overall assessment>"
}

Be specific, reference actual task data. Be diplomatic but honest. Compare to team averages where relevant.`,
      },
    ],
  });

  try {
    let text = message.content[0].type === "text" ? message.content[0].text : "";
    text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "Failed to parse response" }, { status: 500 });
  }
}
