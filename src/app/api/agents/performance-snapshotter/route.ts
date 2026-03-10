import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logAgentActivity } from "@/lib/slack";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
);

export async function POST() {
  const today = new Date().toISOString().split("T")[0];

  // Fetch all active employees
  const { data: employees, error } = await supabase
    .from("employees")
    .select("*")
    .eq("is_active", true);

  if (error || !employees) {
    return NextResponse.json({ message: `DB error: ${error?.message}` }, { status: 500 });
  }

  // Fetch active task counts per employee
  const { data: activeTasks } = await supabase
    .from("tasks")
    .select("assignee_id")
    .in("status", ["pending", "acknowledged", "in_progress", "blocked"]);

  const activeCountMap: Record<string, number> = {};
  for (const t of activeTasks || []) {
    if (t.assignee_id) {
      activeCountMap[t.assignee_id] = (activeCountMap[t.assignee_id] || 0) + 1;
    }
  }

  let created = 0;
  let skipped = 0;

  for (const emp of employees) {
    // Check if snapshot already exists for today
    const { data: existing } = await supabase
      .from("performance_snapshots")
      .select("id")
      .eq("employee_id", emp.id)
      .eq("snapshot_date", today)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    await supabase.from("performance_snapshots").insert({
      employee_id: emp.id,
      snapshot_date: today,
      tasks_completed: emp.tasks_completed,
      on_time_percentage: emp.on_time_percentage,
      avg_variance_ratio: emp.avg_variance_ratio,
      avg_response_minutes: emp.avg_response_minutes,
      active_task_count: activeCountMap[emp.id] || 0,
    });

    created++;
  }

  if (created > 0) {
    await logAgentActivity(
      "Performance Snapshotter",
      `Captured daily snapshots for ${created} employees`,
      `:camera: Recorded performance metrics for trend analysis.\n${skipped > 0 ? `${skipped} already captured today.` : ""}`
    );
  }

  return NextResponse.json({
    message: `Snapshots: ${created} created, ${skipped} skipped (already exists)`,
    created,
    skipped,
  });
}
