import { NextResponse } from "next/server";

const AGENTS = [
  { id: "update-checker", interval_minutes: 5 },
  { id: "task-analyzer", interval_minutes: 60 },
  { id: "deadline-guardian", interval_minutes: 30 },
  { id: "daily-digest", interval_minutes: 1440 },
];

// Simple in-memory last-run tracker (resets on cold start, which is fine —
// agents are idempotent and will just run once on next invocation)
const lastRun: Record<string, number> = {};

export async function GET(req: Request) {
  // Verify cron secret in production
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const results: Record<string, unknown> = {};

  for (const agent of AGENTS) {
    const last = lastRun[agent.id] || 0;
    const elapsed = (now - last) / 60000;

    if (elapsed < agent.interval_minutes) {
      results[agent.id] = { skipped: true, next_in: Math.round(agent.interval_minutes - elapsed) };
      continue;
    }

    try {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_VERCEL_URL
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
          : "http://localhost:3000";

      const res = await fetch(`${baseUrl}/api/agents/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      lastRun[agent.id] = now;
      results[agent.id] = { success: res.ok, data };
    } catch (err) {
      results[agent.id] = {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  return NextResponse.json({ dispatched_at: new Date().toISOString(), results });
}
