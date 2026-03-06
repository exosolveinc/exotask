import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
);

// POST /api/tasks/[id]/respond
// Body: { employee_id, message?, progress_percent?, status? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const body = await req.json();
  const { employee_id, message, progress_percent, status } = body;

  if (!employee_id) {
    return NextResponse.json(
      { error: "employee_id is required" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // Update the task's last_response_at and optionally progress/status
  const updates: Record<string, unknown> = {
    last_response_at: now,
    current_escalation: "slack", // reset escalation on response
  };

  if (progress_percent !== undefined) {
    updates.progress_percent = progress_percent;
  }
  if (status) {
    updates.status = status;
    if (status === "in_progress" && !updates.started_at) {
      updates.started_at = now;
    }
    if (status === "done") {
      updates.completed_at = now;
      updates.progress_percent = 100;
    }
  }

  const { error: updateError } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  // Log the response as activity
  await supabase.from("task_activity").insert({
    task_id: taskId,
    actor_id: employee_id,
    activity_type: "tracker_response",
    message: message || "Responded to tracker ping",
    metadata: {
      progress_percent: progress_percent ?? null,
      status: status ?? null,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Response recorded. Escalation reset.",
  });
}
