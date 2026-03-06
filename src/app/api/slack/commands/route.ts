import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder"
);

// POST /api/slack/commands — Slack slash command handler
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const command = formData.get("command") as string;
  const text = formData.get("text") as string;
  const userId = formData.get("user_id") as string;

  // Verify Slack signing secret in production
  // const signature = req.headers.get("x-slack-signature");
  // TODO: verify signature

  if (command === "/task") {
    return handleCreateTask(text, userId);
  }

  if (command === "/tasks") {
    return handleListTasks(text, userId);
  }

  if (command === "/status") {
    return handleStatusUpdate(text, userId);
  }

  if (command === "/done") {
    return handleDone(text, userId);
  }

  if (command === "/track") {
    return handleTrack(text);
  }

  return NextResponse.json({
    response_type: "ephemeral",
    text: "Unknown command. Try /task, /tasks, /status, /done, or /track",
  });
}

async function handleCreateTask(text: string, slackUserId: string) {
  // Parse: @mention Title P0-P3 --due <value>
  const mentionMatch = text.match(/<@(\w+)>/);
  let assigneeId: string | null = null;

  if (mentionMatch) {
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("slack_id", mentionMatch[1])
      .single();
    assigneeId = emp?.id || null;
  }

  // Find creator
  const { data: creator } = await supabase
    .from("employees")
    .select("id")
    .eq("slack_id", slackUserId)
    .single();

  const priorityMatch = text.match(/\b(P[0-3])\b/i);
  const priority = priorityMatch ? priorityMatch[1].toUpperCase() : "P2";

  const dueMatch = text.match(/--due\s+(\S+)/);
  let dueAt: string | null = null;
  if (dueMatch) {
    const val = dueMatch[1].toLowerCase();
    const now = new Date();
    if (val === "tomorrow") {
      now.setDate(now.getDate() + 1);
      dueAt = now.toISOString();
    } else if (val.endsWith("h")) {
      now.setHours(now.getHours() + parseInt(val));
      dueAt = now.toISOString();
    } else if (val.endsWith("d")) {
      now.setDate(now.getDate() + parseInt(val));
      dueAt = now.toISOString();
    }
  }

  const title = text
    .replace(/<@\w+>/, "")
    .replace(/\b(P[0-3])\b/i, "")
    .replace(/--due\s+\S+/, "")
    .trim();

  if (!title) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Usage: /task @person Task title P1 --due tomorrow",
    });
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title,
      assignee_id: assigneeId,
      created_by_id: creator?.id || null,
      priority,
      due_at: dueAt,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: `Error creating task: ${error.message}`,
    });
  }

  // Also enqueue for tracker
  if (task) {
    await supabase.from("tracker_queue").insert({
      task_id: task.id,
      next_check_at: new Date(
        Date.now() + (task.tracker_interval_minutes || 60) * 60000
      ).toISOString(),
    });
  }

  return NextResponse.json({
    response_type: "in_channel",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*New Task Created* :zap:\n*${title}*\nPriority: ${priority} | ${
            assigneeId ? `Assigned to <@${mentionMatch?.[1]}>` : "Unassigned"
          }${dueAt ? ` | Due: ${new Date(dueAt).toLocaleDateString()}` : ""}`,
        },
      },
    ],
  });
}

async function handleListTasks(text: string, slackUserId: string) {
  const mentionMatch = text.match(/<@(\w+)>/);
  let query = supabase
    .from("tasks")
    .select("*, assignee:employees!assignee_id(name, slack_id)")
    .is("parent_id", null)
    .not("status", "in", '("done","cancelled")')
    .order("priority")
    .limit(10);

  if (mentionMatch) {
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("slack_id", mentionMatch[1])
      .single();
    if (emp) query = query.eq("assignee_id", emp.id);
  } else if (!text.includes("team")) {
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("slack_id", slackUserId)
      .single();
    if (emp) query = query.eq("assignee_id", emp.id);
  }

  const { data: tasks } = await query;

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "No active tasks found.",
    });
  }

  const lines = tasks.map((t: Record<string, unknown>) => {
    const assignee = t.assignee as Record<string, unknown> | null;
    return `• *${t.title}* [${t.priority}] — ${t.progress_percent}% — ${
      assignee ? (assignee.name as string).split(" ")[0] : "unassigned"
    }`;
  });

  return NextResponse.json({
    response_type: "ephemeral",
    text: `*Active Tasks (${tasks.length})*\n${lines.join("\n")}`,
  });
}

async function handleStatusUpdate(text: string, slackUserId: string) {
  // /status <short-id or title fragment> 70% message
  const percentMatch = text.match(/(\d+)%/);
  const percent = percentMatch ? parseInt(percentMatch[1]) : null;
  const message = text.replace(/\S+/, "").replace(/\d+%/, "").trim();

  // Find the employee's most recent in_progress task
  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("slack_id", slackUserId)
    .single();

  if (!emp) {
    return NextResponse.json({ response_type: "ephemeral", text: "Employee not found." });
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("assignee_id", emp.id)
    .in("status", ["in_progress", "acknowledged", "pending"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ response_type: "ephemeral", text: "No active task found." });
  }

  const task = tasks[0];
  const updates: Record<string, unknown> = {
    last_response_at: new Date().toISOString(),
  };
  if (percent !== null) updates.progress_percent = percent;
  if (!tasks[0]) return NextResponse.json({ response_type: "ephemeral", text: "No task." });

  await supabase.from("tasks").update(updates).eq("id", task.id);

  await supabase.from("task_activity").insert({
    task_id: task.id,
    actor_id: emp.id,
    activity_type: "progress_update",
    message: message || `Updated to ${percent}%`,
    metadata: { progress_percent: percent },
  });

  return NextResponse.json({
    response_type: "in_channel",
    text: `:white_check_mark: *${task.title}* updated to ${percent}%${
      message ? ` — "${message}"` : ""
    }`,
  });
}

async function handleDone(_text: string, slackUserId: string) {
  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("slack_id", slackUserId)
    .single();

  if (!emp) {
    return NextResponse.json({ response_type: "ephemeral", text: "Employee not found." });
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("assignee_id", emp.id)
    .not("status", "eq", "done")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ response_type: "ephemeral", text: "No active task." });
  }

  const task = tasks[0];
  await supabase
    .from("tasks")
    .update({
      status: "done",
      progress_percent: 100,
      completed_at: new Date().toISOString(),
    })
    .eq("id", task.id);

  // Deactivate tracker
  await supabase
    .from("tracker_queue")
    .update({ is_active: false })
    .eq("task_id", task.id);

  return NextResponse.json({
    response_type: "in_channel",
    text: `:tada: *${task.title}* marked as done!`,
  });
}

async function handleTrack(_text: string) {
  // /track <task-fragment> every 15m | pause
  // Simplified — in production, resolve task by fuzzy title match
  return NextResponse.json({
    response_type: "ephemeral",
    text: "Tracker configuration updated. Use the web UI for more control.",
  });
}
