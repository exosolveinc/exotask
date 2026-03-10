import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
);

// GET: Fetch proposals (default: pending only)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";
  const limit = parseInt(url.searchParams.get("limit") || "20");

  let query = supabase
    .from("ai_proposals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ proposals: data || [] });
}

// POST: Act on a proposal (approve/reject)
export async function POST(req: Request) {
  const { proposal_id, action } = await req.json();

  if (!proposal_id || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "proposal_id and action (approve|reject) required" }, { status: 400 });
  }

  const { data: proposal, error: fetchError } = await supabase
    .from("ai_proposals")
    .select("*")
    .eq("id", proposal_id)
    .single();

  if (fetchError || !proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  if (action === "approve") {
    // Execute the proposed action
    const changes = proposal.proposed_changes as Record<string, unknown>;

    switch (proposal.action_type) {
      case "reassign": {
        if (changes.new_assignee_id && proposal.target_task_id) {
          await supabase
            .from("tasks")
            .update({ assignee_id: changes.new_assignee_id })
            .eq("id", proposal.target_task_id);

          await supabase.from("task_activity").insert({
            task_id: proposal.target_task_id,
            activity_type: "reassigned",
            message: `AI reassigned task (approved by manager)`,
            metadata: { old_assignee: changes.old_assignee_id, new_assignee: changes.new_assignee_id, proposal_id },
          });
        }
        break;
      }

      case "extend_deadline": {
        if (changes.new_due_at && proposal.target_task_id) {
          await supabase
            .from("tasks")
            .update({ due_at: changes.new_due_at })
            .eq("id", proposal.target_task_id);

          await supabase.from("task_activity").insert({
            task_id: proposal.target_task_id,
            activity_type: "due_date_changed",
            message: `AI extended deadline (approved by manager)`,
            metadata: { old_due: changes.old_due_at, new_due: changes.new_due_at, proposal_id },
          });
        }
        break;
      }

      case "escalate_priority": {
        if (changes.new_priority && proposal.target_task_id) {
          await supabase
            .from("tasks")
            .update({ priority: changes.new_priority })
            .eq("id", proposal.target_task_id);
        }
        break;
      }
    }
  }

  // Update proposal status
  await supabase
    .from("ai_proposals")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", proposal_id);

  return NextResponse.json({ success: true, action, proposal_id });
}
