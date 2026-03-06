# ExoTask

**AI-powered task management system that acts as your team's autonomous delivery manager.**

ExoTask doesn't just track tasks — it actively enforces accountability through intelligent agents that monitor progress, estimate work, guard deadlines, and escalate through multiple communication channels when developers go dark. Think of it as a relentless but friendly AI PM that never sleeps, never forgets, and always follows up.

Built for small dev teams (3–8 people) who want structure without the overhead of a full-time project manager.

---

## Table of Contents

- [Core Philosophy](#core-philosophy)
- [Features Overview](#features-overview)
- [AI Agents — The Brain](#ai-agents--the-brain)
- [Escalation System](#escalation-system)
- [AI-Powered Task Intelligence](#ai-powered-task-intelligence)
- [Slack Integration](#slack-integration)
- [Frontend Application](#frontend-application)
- [Architecture & API Reference](#architecture--api-reference)
- [Database Schema](#database-schema)
- [Type System](#type-system)
- [Cron & Scheduling](#cron--scheduling)
- [Tech Stack](#tech-stack)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Current Team Setup](#current-team-setup)
- [Future Roadmap](#future-roadmap)

---

## Core Philosophy

1. **No task should go silent.** If someone's assigned work and they haven't updated in 24 hours, the system notices and acts.
2. **Priority drives urgency.** A P0 bug gets pinged every 2.5 minutes. A P3 nice-to-have gets checked once every 7.5 minutes. The system adapts its urgency to match the task's importance.
3. **Escalation has teeth.** Starting with a friendly Slack DM, the system will escalate through WhatsApp, phone calls, and finally manager notification if a developer remains unresponsive.
4. **AI provides the analysis, not just the tracking.** Claude reads the full team context — workload, variance ratios, on-time percentages, deadlines — and produces human-quality assessments with specific names, numbers, and actionable recommendations.
5. **Estimation improves over time.** The system tracks how long tasks actually take vs. AI estimates, building a per-developer variance profile that gets more accurate with each completed task.

---

## Features Overview

### Task Management
- **Create tasks** with title, description, priority (P0–P3), assignee, deadline, and parent task
- **Inline shortcut syntax** in the task list input: `@prashant P1 /2d Fix the login bug` — assigns to Prashant, sets P1 priority, sets deadline to 2 days from now
- **Subtask support** — break down large tasks into sub-items, each independently trackable
- **Status workflow**: `pending` → `acknowledged` → `in_progress` → `blocked` → `review` → `done` (or `cancelled`)
- **Progress tracking** with 0–100% granularity
- **Real-time updates** via Supabase Postgres changes subscription — the UI updates instantly when any task changes in the database
- **Mock mode** — the app falls back to in-memory mock data if no Supabase URL is configured, so the frontend works standalone for development

### Task Detail Panel
- Full task view with all metadata: priority, status, assignee, deadline, progress, AI estimate, actual hours
- **Activity timeline** showing every event: creation, status changes, tracker pings, escalations, responses, progress updates
- **Tracker configuration** per task: enable/disable tracking, set ping interval (15m / 30m / 1h / 2h / 4h)
- **Status quick-change** buttons for the full workflow
- **Subtask management** — add subtasks inline from the detail view

### Command Bar (Cmd+K)
- Global command palette powered by `cmdk`
- Quick actions: create task, view tasks, open stats, open tracker settings
- **Quick task creation**: type `/task @prashant Fix auth bug P1 --due tomorrow` and hit Enter
- Employee directory for quick assignment
- Keyboard navigation with arrow keys and Enter

---

## AI Agents — The Brain

Four autonomous agents run on configurable schedules, each with a specific responsibility. They operate independently and post all activity to a dedicated Slack channel with rich Block Kit formatting.

### 1. Update Checker
**Schedule:** Every 5 minutes | **Route:** `POST /api/agents/update-checker`

The workhorse agent. Monitors every active task in the system — not just ones with tracking enabled.

**What it does:**
- Iterates through ALL tasks with status `pending`, `acknowledged`, `in_progress`, or `blocked`
- For **tracker-enabled tasks**: follows the full escalation protocol (see [Escalation System](#escalation-system))
- For **non-tracker tasks**: performs stale detection — if an `in_progress` task has had no activity for a threshold period, the agent prods the developer via Slack DM
- **Unassigned task detection**: if an active task has no `assignee_id`, the agent flags it and DMs the manager asking them to assign someone

**Priority-aware behavior:**
| Priority | Ping Interval Multiplier | Stale Threshold | Escalation Speed |
|----------|--------------------------|-----------------|------------------|
| P0 | 0.5x (half the base) | 24 hours | 2x faster (7.5 min) |
| P1 | 0.75x | 24 hours | Normal (15 min) |
| P2 | 1.0x (base) | 48 hours | Normal (15 min) |
| P3 | 1.5x (less frequent) | 48 hours | Normal (15 min) |

**Ping message intelligence:**
The agent sends different messages based on task status:
- **Pending**: "Hey {name}, *"{title}"* is still pending. Can you start on it?"
- **Blocked**: "{name}, *"{title}"* is blocked. What's the blocker? Need help?"
- **In Progress**: "Hey {name}, how's *"{title}"* going? Quick status update?"

Each message includes urgency prefixes for P0/P1 and deadline context (overdue, due today, due in Xh).

**Slack channel summary:**
Posts to `#exotask-agents` with sections for pinged tasks, escalations, and stale prods. Uses `:speech_balloon:`, `:arrow_up:`, `:eyes:` emoji and quote blocks for each item.

---

### 2. Task Analyzer
**Schedule:** Every 60 minutes | **Route:** `POST /api/agents/task-analyzer`

The strategic brain. Uses Claude AI to analyze the full state of the team and produce actionable insights.

**What it does:**
1. Fetches all active employees, all tasks (active and historical), and the 50 most recent activity events
2. Computes active task count and overdue task count
3. Builds a data summary per employee: role, tasks completed, on-time percentage, variance ratio, current active task count
4. Sends everything to Claude Haiku with a detailed personality prompt

**AI personality:**
The prompt instructs Claude to act as "ExoTask's senior analyst — sharp, warm, and impossible to fool." It produces:
- `:zap: *Overall Pulse*` — 1-2 sentence team health assessment
- `:rotating_light: *Risks & Bottlenecks*` — each risk in a `>` quote block with `:small_red_triangle:`, naming specific people and tasks
- `:bar_chart: *Workload Snapshot*` — per-person breakdown of active tasks, progress, and status
- `:dart: *Action Items*` — 2-3 specific, actionable items with `:one:` `:two:` `:three:` numbering
- Closing witty one-liner in italics

**Slack output:**
Posts via `logAgentActivity` with a purple (`#6C5CE7`) colored sidebar, crystal ball emoji, and "Strategic Analysis" tagline in the footer.

---

### 3. Deadline Guardian
**Schedule:** Every 30 minutes | **Route:** `POST /api/agents/deadline-guardian`

The watchdog. Scans all tasks with deadlines in the next 24 hours and takes action.

**What it does:**
1. Queries tasks with `due_at <= 24h from now` that are in active statuses
2. Categorizes each into three urgency levels:
   - **Overdue** (`hoursRemaining < 0`): Task is past its deadline
   - **Critical** (`hoursRemaining <= 4`): Due within 4 hours
   - **Warning** (`hoursRemaining <= 24`): Due within 24 hours
3. Logs `task_activity` entries for overdue and critical tasks
4. **DMs assignees directly** via Slack for overdue and critical tasks:
   - Overdue: "Hey {name}, just a heads up — *"{title}"* was due {X}h ago. Can you push an update or let me know where things stand?"
   - Critical: "{name}, *"{title}"* is due in about {X}h — you're in the home stretch!"
5. Posts a color-coded summary to the agent channel

**Slack channel format:**
- `:red_circle: *Overdue — needs immediate attention*` with `:small_red_triangle:` per task
- `:large_orange_circle: *Due very soon*` with `:hourglass_flowing_sand:` per task
- `:large_blue_circle: *Heads up — due within 24h*` with `:clock3:` per task

Uses a red (`#E17055`) colored sidebar with shield emoji.

---

### 4. Daily Digest
**Schedule:** Once per day (every 1440 minutes) | **Route:** `POST /api/agents/daily-digest`

The morning standup host. Uses Claude AI to generate a full daily briefing.

**What it does:**
1. Fetches all activity from the last 24 hours (with joined task data)
2. Fetches all active tasks with assignee details
3. Fetches all active employees with performance stats
4. Sends everything to Claude Haiku with a standup host personality prompt

**AI personality:**
"ExoTask's daily standup host — a warm, sharp PM who makes status updates feel like a conversation, not a chore." Varies greetings daily, references the day of the week, adds wit.

**Output format:**
- `:coffee: *Good morning, team!*` — warm greeting with personality
- `:white_check_mark: *Yesterday's Wins*` — completed tasks or note if none
- `:clipboard: *Today's Board*` — each task with colored circle health indicator (`:red_circle:` blocked/overdue, `:large_orange_circle:` at-risk, `:large_blue_circle:` on-track), owner, progress, due date
- `:warning: *Blockers & Red Flags*` — anything blocked, overdue, or suspiciously quiet
- `:dart: *Today's Priorities*` — 2-3 numbered action items
- Motivational one-liner closing

Also logs itself as a `task_activity` entry and uses a green (`#00B894`) sidebar with newspaper emoji.

---

## Escalation System

For tracker-enabled tasks, the system follows a 4-level escalation chain when a developer doesn't respond to pings.

```
Level 1: Slack DM
    | No response after WAIT_MINUTES (adjusted by priority)
Level 2: WhatsApp (Twilio — planned)
    | No response
Level 3: Phone Call (Twilio Voice — planned)
    | No response
Level 4: Manager Notification (Slack DM to manager)
```

**How escalation works step by step:**

1. **Ping at current level** — The Update Checker sends a notification at the task's `current_escalation` level (starts at `slack`)
2. **Record the ping** — Sets `last_ping_at` on the task, logs a `tracker_ping` activity
3. **Check for response** — On the next cycle, checks if `last_response_at > last_ping_at`
4. **If responded** — Resets `current_escalation` back to `slack`, skips further action
5. **If no response after WAIT_MINUTES** — Moves `current_escalation` to the next level and logs an `escalation` activity
6. **P0 escalates 2x faster** — Uses `WAIT_MINUTES * 0.5` (7.5 minutes instead of 15)
7. **Manager notification** — When escalation reaches `manager` level, the system DMs the manager with full context: "Manager escalation: {name} is unresponsive on their task."

**Response endpoint:** Developers can respond via `POST /api/tasks/[id]/respond` which:
- Resets `current_escalation` to `slack`
- Updates `last_response_at`
- Optionally updates `progress_percent` and `status`
- Logs a `tracker_response` activity

---

## AI-Powered Task Intelligence

### Auto-Estimation
When a new task is created (non-subtask), the system fires a background request to `/api/ai/suggest` which:

1. Fetches the full team context from Supabase: each employee's ID, name, role, tasks completed, on-time percentage, variance ratio, and current active task count
2. Sends the task title, description, and team context to Claude Haiku
3. Claude returns a JSON response with:
   - `priority`: Suggested P0–P3 based on task nature
   - `assignee_id`: Recommended assignee (UUID) based on workload, skill match, and availability
   - `assignee_reason`: One-line explanation of why this person was chosen
   - `estimate_hours`: AI-estimated hours to complete
   - `suggested_deadline_hours`: Recommended deadline from now
   - `reasoning`: One-line summary of the suggestion

The `estimate_hours` is saved to `ai_estimate_hours` on the task. This happens fire-and-forget — it doesn't block task creation.

### Inline AI Suggestions
In the task list's inline creation input, as the user types:
- After 3+ characters and 500ms debounce, the system calls `/api/ai/suggest` with the title
- Shows a suggestion pill below the input: "AI will assign: {name} — {reason}"
- Suggestions auto-apply when the user submits the task (no extra step needed)
- Shortcut syntax (`@name`, `P0-P3`, `/2d`) is stripped before sending to AI, so suggestions work even when shortcuts are present

### Variance Tracking
When a task is marked as `done`:
1. `actual_hours` is calculated: `(now - started_at) / 3600000`, rounded to 1 decimal
2. `completed_at` is set, `progress_percent` set to 100
3. Employee stats are recalculated by querying ALL completed tasks for that employee:
   - `tasks_completed`: total count of `status = done` tasks
   - `avg_variance_ratio`: average of `actual_hours / ai_estimate_hours` across all tasks that have both values
   - `on_time_percentage`: percentage of tasks where `completed_at <= due_at`

Over time, this builds a per-developer profile that the AI uses to improve future estimates and assignment suggestions.

---

## Slack Integration

### Setup Requirements
- Slack app with scopes: `chat:write`, `im:write`, `im:read`, `users:read`
- Bot token (`xoxb-...`) in `SLACK_BOT_TOKEN`
- Dedicated channel for agent activity (e.g., `#exotask-agents`), channel ID in `SLACK_AGENT_CHANNEL_ID`
- Employee Slack user IDs stored in the `employees.slack_id` column in Supabase

### Shared Slack Client (`src/lib/slack.ts`)

**`sendSlackDM(slackUserId, text)`**
Opens a DM conversation with the user via `conversations.open`, then sends a message. Used by Update Checker (pings), Deadline Guardian (warnings), and escalation system (manager notifications).

**`postToChannel(channelId, text)`**
Posts a plain text message to any Slack channel. General-purpose utility.

**`logAgentActivity(agentName, headline, details?)`**
The main function for agent channel posts. Produces rich Slack messages using:
- **Attachments with colored sidebar** — each agent has a unique color:
  - Task Analyzer: purple `#6C5CE7`
  - Daily Digest: green `#00B894`
  - Deadline Guardian: red `#E17055`
  - Update Checker: blue `#0984E3`
- **Block Kit blocks inside attachments:**
  - Section block with bolded headline
  - Detail blocks for each section of the message (auto-split at double newlines)
  - Context block footer with agent emoji, tagline, date/time (IST), and "ExoTask AI" branding
- **Text chunking** — details are split into 2900-character blocks to respect Slack's 3000-char per-block limit
- **Fallback text** — plain text version for notifications and accessibility

### Slack Slash Commands (`POST /api/slack/commands`)

Five slash commands available:

**`/task @person Task title P1 --due tomorrow`**
Creates a task from Slack. Parses @mentions to find employee by Slack ID, extracts priority (P0-P3), parses deadline (tomorrow, Xh, Xd). Creates the task in Supabase with the creator's employee ID. Responds in-channel with a Block Kit card showing the new task.

**`/tasks` or `/tasks @person` or `/tasks team`**
Lists active tasks. No argument shows your own tasks (matched by Slack user ID). @mention shows that person's tasks. "team" shows all tasks. Responds ephemerally with a bullet list (max 10).

**`/status 70% Almost done with the auth flow`**
Updates your most recent in-progress task's progress and logs a `progress_update` activity. Responds in-channel confirming the update.

**`/done`**
Marks your most recent active task as completed. Sets `status=done`, `progress_percent=100`, `completed_at=now()`. Deactivates the tracker queue entry. Responds with a celebration message.

**`/track`**
Placeholder for tracker configuration from Slack. Currently returns a message pointing to the web UI.

---

## Frontend Application

### Main Page (`src/app/page.tsx`)
Single-page app with three views switchable via the sidebar:
- **Tasks view** — task list with inline creation and detail panel
- **Stats view** — team performance dashboard
- **Tracker view** — agent monitoring and control

### Sidebar (`src/components/sidebar.tsx`)
- Navigation: Tasks, Stats, Agents
- Team member list with avatar initials and active task counts
- Click a team member to filter the task list to their tasks
- Channel links section at the bottom

### Task List (`src/components/task-list.tsx`)
- **Inline task creation** at the top with shortcut parsing
- **AI suggestion pill** appears below input after 500ms debounce
- Tasks displayed with status icon, priority badge, title, assignee avatar, progress bar
- Expandable subtasks (chevron toggle)
- Tracker indicator (bot icon) for tracked tasks
- Overdue warning indicator (triangle icon with amber color)
- Click a task to open the detail panel

**Shortcut syntax in inline input:**
| Shortcut | Example | Effect |
|----------|---------|--------|
| `@name` | `@prashant` | Assigns to matching employee |
| `P0`-`P3` | `P1` | Sets priority |
| `/Xd` | `/2d` | Sets deadline X days from now |
| `/Xh` | `/4h` | Sets deadline X hours from now |
| `/Xw` | `/1w` | Sets deadline X weeks from now |

### Task Detail (`src/components/task-detail.tsx`)
- Full metadata display: priority, status, assignee, dates, estimates
- **Status workflow buttons** — click any status to transition
- **Progress slider** — 0-100%
- **Tracker controls**: enable/disable, set interval (15m / 30m / 1h / 2h / 4h)
- **Subtask list** with inline add
- **Activity timeline** showing all events chronologically with formatted timestamps

### Tracker/Agent View (`src/components/tracker-view.tsx`)
- **Agent cards** for each of the 4 agents showing:
  - Name, description, current status (idle/running/error/disabled)
  - Last run time (relative)
  - Run button (manually trigger agent)
  - Toggle switch (enable/disable)
  - Last result message
- **Tracked tasks section** showing all tracker-enabled tasks with:
  - Current escalation level
  - Last ping time
  - Last response time
  - Tracker interval
  - Quick toggle to enable/disable tracking per task

### Stats View (`src/components/stats-view.tsx`)
- **Summary cards**: total tasks, completion rate, average variance, team size
- **Per-employee cards** showing:
  - Avatar with initials
  - Tasks completed count
  - On-time percentage with color coding (green > 80%, yellow > 60%, red otherwise)
  - Variance ratio with visual bar (1.0x = perfect estimation)
  - Active task count
- **AI Analysis button** — triggers the Task Analyzer agent on-demand and displays the result

### Utilities (`src/lib/utils.ts`)
- `cn()` — Tailwind class merging via `clsx` + `tailwind-merge`
- `priorityConfig` — color and label mapping for P0-P3
- `statusConfig` — icon, color, and label mapping for all statuses
- `formatRelativeTime()` — "2h ago", "3d ago" style formatting
- `displayName()` — returns nickname or first name for an employee
- `getInitials()` — returns first letter of first and last name

---

## Architecture & API Reference

```
Next.js 16 App Router (TypeScript)
|-- src/app/
|   |-- page.tsx                          -- Main SPA entry point
|   |-- layout.tsx                        -- Root layout with Geist font
|   |-- globals.css                       -- Tailwind v4 styles
|   |-- api/
|       |-- agents/
|       |   |-- update-checker/route.ts   -- POST: ping & escalation engine
|       |   |-- task-analyzer/route.ts    -- POST: AI workload analysis
|       |   |-- deadline-guardian/route.ts -- POST: deadline monitoring
|       |   |-- daily-digest/route.ts     -- POST: AI daily standup
|       |-- ai/
|       |   |-- suggest/route.ts          -- POST: AI task suggestions & estimation
|       |-- cron/route.ts                 -- GET: unified cron dispatcher
|       |-- tasks/
|       |   |-- [id]/respond/route.ts     -- POST: developer response endpoint
|       |-- tracker/route.ts              -- POST: legacy tracker (queue-based)
|       |-- slack/
|           |-- commands/route.ts         -- POST: Slack slash command handler
|-- src/components/
|   |-- task-list.tsx                     -- Task board with inline creation
|   |-- task-detail.tsx                   -- Task detail side panel
|   |-- tracker-view.tsx                  -- Agent dashboard
|   |-- stats-view.tsx                    -- Team performance metrics
|   |-- sidebar.tsx                       -- Navigation & team list
|   |-- command-bar.tsx                   -- Cmd+K command palette
|-- src/lib/
|   |-- slack.ts                          -- Slack client, DMs, Block Kit posts
|   |-- agents/
|   |   |-- registry.ts                   -- Agent config singleton with pub/sub
|   |   |-- types.ts                      -- Agent type definitions
|   |-- hooks/
|   |   |-- use-tasks.ts                  -- Task CRUD, auto-estimation, stats
|   |-- supabase/
|   |   |-- client.ts                     -- Supabase browser client
|   |   |-- types.ts                      -- Full database type definitions
|   |-- utils.ts                          -- UI utilities
|   |-- mock-data.ts                      -- Fallback mock employees
|   |-- mock-store.ts                     -- In-memory mock task store
|-- vercel.json                           -- Cron configuration
```

### API Routes Detail

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/agents/update-checker` | POST | None | Runs the Update Checker agent |
| `/api/agents/task-analyzer` | POST | None | Runs the Task Analyzer agent (requires `ANTHROPIC_API_KEY`) |
| `/api/agents/deadline-guardian` | POST | None | Runs the Deadline Guardian agent |
| `/api/agents/daily-digest` | POST | None | Runs the Daily Digest agent (requires `ANTHROPIC_API_KEY`) |
| `/api/ai/suggest` | POST | None | Returns AI suggestion for a task. Body: `{title, description?}` |
| `/api/cron` | GET | `CRON_SECRET` (optional) | Dispatches all agents based on their intervals |
| `/api/tasks/[id]/respond` | POST | None | Records developer response. Body: `{employee_id, message?, progress_percent?, status?}` |
| `/api/tracker` | POST | None | Legacy queue-based tracker (uses `tracker_queue` table) |
| `/api/slack/commands` | POST | Slack signing | Handles `/task`, `/tasks`, `/status`, `/done`, `/track` commands |

---

## Database Schema

### `employees`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `name` | text | required | Full name (e.g., "Prashant Parajuli") |
| `nickname` | text | null | Short name for messages (e.g., "Prashant") |
| `email` | text | required | Email address |
| `avatar_url` | text | null | Profile image URL |
| `slack_id` | text | null | Slack user ID for DMs (e.g., "U095517FT6G") |
| `discord_id` | text | null | Discord user ID (future) |
| `phone` | text | null | Phone number for voice escalation |
| `whatsapp` | text | null | WhatsApp number for messaging escalation |
| `role` | text | 'developer' | One of: `developer`, `lead`, `manager` |
| `avg_variance_ratio` | float | 1.0 | Rolling average of actual_hours / ai_estimate_hours |
| `avg_response_minutes` | float | 0 | Average response time to tracker pings |
| `tasks_completed` | int | 0 | Total completed task count |
| `on_time_percentage` | float | 100 | Percentage of tasks completed before deadline |
| `is_active` | boolean | true | Whether employee is active |
| `created_at` | timestamp | now() | Record creation time |
| `updated_at` | timestamp | now() | Last update time |

### `tasks`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `parent_id` | uuid | null | FK to tasks (for subtasks) |
| `title` | text | required | Task title |
| `description` | text | null | Full description |
| `status` | text | 'pending' | One of: `pending`, `acknowledged`, `in_progress`, `blocked`, `review`, `done`, `cancelled` |
| `priority` | text | 'P2' | One of: `P0`, `P1`, `P2`, `P3` |
| `assignee_id` | uuid | null | FK to employees |
| `created_by_id` | uuid | null | FK to employees (who created it) |
| `ai_estimate_hours` | float | null | AI-generated hour estimate |
| `actual_hours` | float | null | Calculated on completion: (completed_at - started_at) in hours |
| `due_at` | timestamp | null | Task deadline |
| `started_at` | timestamp | null | When status first changed to in_progress |
| `completed_at` | timestamp | null | When status changed to done |
| `tracker_enabled` | boolean | false | Whether full escalation tracking is on |
| `tracker_interval_minutes` | int | 60 | Base ping interval (before priority multiplier) |
| `current_escalation` | text | 'slack' | Current escalation level: `slack`, `whatsapp`, `phone`, `manager` |
| `last_ping_at` | timestamp | null | When the tracker last pinged for this task |
| `last_response_at` | timestamp | null | When the assignee last responded |
| `progress_percent` | int | 0 | 0-100 progress |
| `sort_order` | int | 0 | Display ordering |
| `created_at` | timestamp | now() | Record creation time |
| `updated_at` | timestamp | now() | Last update time |

### `task_activity`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `task_id` | uuid | null | FK to tasks (null for system-level events like daily digest) |
| `actor_id` | uuid | null | FK to employees (who performed the action, null for agents) |
| `activity_type` | text | required | One of: `created`, `status_change`, `progress_update`, `assigned`, `reassigned`, `comment`, `tracker_ping`, `tracker_response`, `escalation`, `completed`, `due_date_changed` |
| `message` | text | null | Human-readable description of the event |
| `metadata` | jsonb | {} | Structured data (e.g., `{new_status: "done"}`, `{escalation_level: "whatsapp"}`) |
| `created_at` | timestamp | now() | Event time |

### `tracker_queue`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `task_id` | uuid | required | FK to tasks |
| `next_check_at` | timestamp | required | When to next check this task |
| `escalation_level` | text | 'slack' | Current escalation level |
| `attempts_at_current_level` | int | 0 | How many pings at this level without response |
| `is_active` | boolean | true | Whether this queue entry is active |
| `created_at` | timestamp | now() | Record creation time |

> **Note:** The `tracker_queue` table is used by the legacy `/api/tracker` route. The newer `/api/agents/update-checker` route manages escalation state directly on the `tasks` table via `current_escalation`, `last_ping_at`, and `last_response_at`.

---

## Type System

All types are defined in `src/lib/supabase/types.ts`:

```typescript
type TaskStatus = "pending" | "acknowledged" | "in_progress" | "blocked" | "review" | "done" | "cancelled";
type TaskPriority = "P0" | "P1" | "P2" | "P3";
type EscalationLevel = "slack" | "whatsapp" | "phone" | "manager";
type ActivityType = "created" | "status_change" | "progress_update" | "assigned"
  | "reassigned" | "comment" | "tracker_ping" | "tracker_response"
  | "escalation" | "completed" | "due_date_changed";

interface Employee {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  avatar_url: string | null;
  slack_id: string | null;
  discord_id: string | null;
  phone: string | null;
  whatsapp: string | null;
  role: "developer" | "lead" | "manager";
  avg_variance_ratio: number;
  avg_response_minutes: number;
  tasks_completed: number;
  on_time_percentage: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Task {
  id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  created_by_id: string | null;
  ai_estimate_hours: number | null;
  actual_hours: number | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  tracker_enabled: boolean;
  tracker_interval_minutes: number;
  current_escalation: EscalationLevel;
  last_ping_at: string | null;
  last_response_at: string | null;
  progress_percent: number;
  sort_order: number;
  assignee?: Employee;
  subtasks?: Task[];
}
```

Agent types in `src/lib/agents/types.ts`:
```typescript
type AgentStatus = "idle" | "running" | "error" | "disabled";

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  icon: string;           // lucide icon name
  interval_minutes: number;
  enabled: boolean;
  last_run_at: string | null;
  last_result: AgentRunResult | null;
  status: AgentStatus;
}

interface AgentRunResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}
```

---

## Cron & Scheduling

### Vercel Cron (`vercel.json`)
```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Vercel calls `GET /api/cron` every 5 minutes.

### Cron Dispatcher (`/api/cron/route.ts`)
The dispatcher maintains an in-memory `lastRun` map and checks each agent's interval:

| Agent | Interval | Runs every |
|-------|----------|------------|
| Update Checker | 5 min | Every cron invocation |
| Deadline Guardian | 30 min | Every 6th invocation |
| Task Analyzer | 60 min | Every 12th invocation |
| Daily Digest | 1440 min | Once per day |

The dispatcher calls each agent's POST endpoint via internal fetch. The `lastRun` map resets on cold start (Vercel serverless), but that's fine — all agents are idempotent.

Optional `CRON_SECRET` authentication via Bearer token for production security.

### Agent Registry (`src/lib/agents/registry.ts`)
Client-side singleton that maintains agent state with pub/sub for UI reactivity:
- `getAgents()` / `getAgent(id)` — read agent configs
- `runAgent(id)` — calls the agent's POST endpoint, updates status
- `toggleAgent(id)` — enable/disable an agent
- `subscribe(listener)` — get notified when any agent state changes

The Tracker View component subscribes to the registry to show real-time agent status.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | 5.x |
| UI Framework | React | 19.2.3 |
| Styling | Tailwind CSS | v4 |
| Database | Supabase (PostgreSQL) | 2.98.0 |
| AI | Anthropic Claude Haiku | `claude-haiku-4-5-20251001` |
| Messaging | Slack Web API | 7.14.1 |
| UI Components | Radix UI (Avatar, Dialog, Dropdown, Popover, Select, Progress, Tabs, Tooltip, Separator, Slot) | Latest |
| Command Palette | cmdk | 1.1.1 |
| Icons | Lucide React | 0.577.0 |
| Date Utils | date-fns | 4.1.0 |
| CSS Utilities | clsx + tailwind-merge | Latest |
| Deployment | Vercel | With cron jobs |

---

## Environment Variables

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=         # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase anonymous/publishable key
ANTHROPIC_API_KEY=                # Anthropic API key for Claude (required for Task Analyzer, Daily Digest, AI Suggest)

# Slack Integration
SLACK_BOT_TOKEN=                  # Slack bot token (xoxb-...)
SLACK_AGENT_CHANNEL_ID=           # Slack channel ID for agent activity posts

# Optional
SUPABASE_SERVICE_ROLE_KEY=        # Service role key for bypassing RLS (used by tracker and slash commands)
CRON_SECRET=                      # Bearer token for cron endpoint authentication
GROQ_API_KEY=                     # Groq API key (reserved for future use)
```

If `NEXT_PUBLIC_SUPABASE_URL` is empty or not set, the app falls back to mock mode with in-memory data.

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project with the schema tables created
- An Anthropic API key
- A Slack workspace with a bot app installed

### Installation

```bash
cd app
npm install
```

### Configure Environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your credentials
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Set Up Slack

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Add OAuth scopes: `chat:write`, `im:write`, `im:read`, `users:read`
3. Install the app to your workspace
4. Copy the Bot User OAuth Token (`xoxb-...`) to `SLACK_BOT_TOKEN`
5. Create a channel (e.g., `#exotask-agents`) and copy its channel ID to `SLACK_AGENT_CHANNEL_ID`
6. For each team member, find their Slack user ID (Profile > More > Copy member ID) and update the `slack_id` column in the `employees` table

### Set Up Slash Commands (Optional)

In your Slack app settings, add slash commands pointing to your deployed URL:
- `/task` -> `https://your-domain.com/api/slack/commands`
- `/tasks` -> `https://your-domain.com/api/slack/commands`
- `/status` -> `https://your-domain.com/api/slack/commands`
- `/done` -> `https://your-domain.com/api/slack/commands`
- `/track` -> `https://your-domain.com/api/slack/commands`

### Test Agents Manually

```bash
# Run the task analyzer
curl -X POST http://localhost:3000/api/agents/task-analyzer

# Run the daily digest
curl -X POST http://localhost:3000/api/agents/daily-digest

# Run the deadline guardian
curl -X POST http://localhost:3000/api/agents/deadline-guardian

# Run the update checker
curl -X POST http://localhost:3000/api/agents/update-checker

# Trigger all agents via cron dispatcher
curl http://localhost:3000/api/cron
```

---

## Deployment

### Vercel

```bash
vercel deploy
```

The `vercel.json` automatically configures the cron job. Set all environment variables in the Vercel dashboard.

**Important:** Vercel Cron requires a Pro plan for intervals less than once per day. The `*/5 * * * *` schedule (every 5 minutes) requires Vercel Pro.

### Environment Variables in Vercel

Set these in Settings > Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`
- `SLACK_BOT_TOKEN`
- `SLACK_AGENT_CHANNEL_ID`
- `CRON_SECRET` (recommended for production)

---

## Current Team Setup

| Name | Role | Slack ID | Status |
|------|------|----------|--------|
| Sariph Shrestha | Manager | U094QAS4EAK | Active |
| Prashant Parajuli | Developer | U095517FT6G | Active |
| Aayush Poudel | Developer | U09QKC8TCBZ | Active |
| Sushant Regmi | Developer | Not set | Active |

---

## Future Roadmap

- **WhatsApp escalation** — Twilio WhatsApp API integration for Level 2 escalation
- **Phone call escalation** — Twilio Voice API for Level 3 with TwiML-based spoken notifications
- **Slack signing verification** — Validate `x-slack-signature` headers on slash commands
- **Sprint planning agent** — AI agent that suggests sprint scope based on team velocity and capacity
- **Retrospective agent** — End-of-sprint analysis with variance trends, accuracy improvements, and team velocity charts
- **Slack interactivity** — Button-based responses in DMs (e.g., "Mark as done", "Update progress") instead of requiring API calls
- **GitHub/GitLab integration** — Auto-link commits and PRs to tasks, detect stale branches
- **Mobile notifications** — Push notifications for critical escalations
- **Multi-team support** — Support for multiple teams with separate agent channels and manager hierarchies
