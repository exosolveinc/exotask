# ExoTask

**AI-powered task management system that acts as your team's autonomous delivery manager.**

ExoTask doesn't just track tasks — it actively enforces accountability through intelligent agents that monitor progress, estimate work, guard deadlines, predict risk, and escalate through multiple communication channels when developers go dark. Think of it as a relentless but friendly AI PM that never sleeps, never forgets, and always follows up.

Built for small dev teams (3–8 people) who want structure without the overhead of a full-time project manager.

---

## Table of Contents

- [Core Philosophy](#core-philosophy)
- [Features Overview](#features-overview)
- [AI Model Architecture](#ai-model-architecture)
- [AI Agents — The Brain](#ai-agents--the-brain)
- [AI Intelligence Layer](#ai-intelligence-layer)
- [AI Proposals System](#ai-proposals-system)
- [Escalation System](#escalation-system)
- [Risk Scoring Engine](#risk-scoring-engine)
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
4. **AI provides the analysis, not just the tracking.** The system reads the full team context — workload, variance ratios, on-time percentages, deadlines — and produces human-quality assessments with specific names, numbers, and actionable recommendations.
5. **Estimation improves over time.** The system tracks how long tasks actually take vs. AI estimates, building a per-developer variance profile that gets more accurate with each completed task.
6. **Dual-model AI routing.** Latency-sensitive operations (inline suggestions, command parsing, queries) use Groq for sub-200ms responses. Deep analytical tasks (decomposition, meeting prep, daily digest) use Anthropic Claude for higher reasoning quality.
7. **Human-in-the-loop governance.** AI agents propose actions (reassignments, deadline extensions, priority changes) but never execute them automatically — humans approve or reject through the Proposals Panel.

---

## Features Overview

### Task Management
- **Create tasks** with title, description, priority (P0–P3), assignee, deadline, and parent task
- **Three creation modes** in the Command Bar (`Cmd+K`):
  - **Structured syntax**: `/task @prashant Fix auth bug P1 --due tomorrow`
  - **Natural language**: Type anything > 5 characters and the AI parses it into a structured task
  - **AI query**: Start with `?` to ask questions about your team/tasks
- **Inline shortcut syntax** in the task list input: `@prashant P1 /2d Fix the login bug` — assigns to Prashant, sets P1 priority, sets deadline to 2 days from now
- **@mention autocomplete** — type `@` followed by characters and get a filtered dropdown of team members with arrow key navigation
- **Subtask support** — break down large tasks into sub-items, each independently trackable
- **AI decomposition** — click "Generate Plan" on any task to have Claude break it into 3–7 subtasks with estimates, assignees, dependencies, and priorities, then "Apply Plan" to create them all at once
- **Status workflow**: `pending` → `acknowledged` → `in_progress` → `blocked` → `review` → `done` (or `cancelled`)
- **Progress tracking** with 0–100% granularity
- **Real-time updates** via Supabase Postgres changes subscription — the UI updates instantly when any task changes in the database
- **Mock mode** — the app falls back to in-memory mock data if no Supabase URL is configured, so the frontend works standalone for development

### Task Detail Panel
- Full task view with all metadata: priority, status, assignee, deadline, progress, AI estimate, actual hours
- **Risk score badge** — computed client-side using the same sigmoid-based algorithm as the Risk Predictor agent, showing High/Medium/Low with percentage
- **Risk factors panel** — lists specific reasons for the risk score (overdue, progress behind expected, low assignee reliability, etc.)
- **Calibrated estimate display** — shows both raw AI estimate and calibrated estimate (raw × assignee's historical variance ratio)
- **AI decomposition section** — "Generate Plan" button calls Claude to decompose the task, shows a preview of subtasks with priorities, estimates, and dependencies, "Apply Plan" creates all subtasks
- **Activity timeline** showing every event: creation, status changes, tracker pings, escalations, responses, progress updates
- **Tracker configuration** per task: enable/disable tracking, set ping interval (15m / 30m / 1h / 2h / 4h)
- **Status quick-change** buttons for the full workflow
- **Subtask management** — add subtasks inline from the detail view

### Command Bar (`Cmd+K`)
- Global command palette powered by `cmdk`
- **Three input modes:**
  - `/task @name Title P1 --due 2d` — structured task creation (original syntax preserved)
  - Plain text (> 5 chars, no `/` prefix) — AI-powered natural language parsing via Groq
  - `?` prefix or suffix — AI query answering with inline results and metric highlights
- Quick actions: create task, ask AI, view tasks, team stats, tracker settings
- Employee directory for quick assignment
- **AI query results** display inline with type-aware icons (info/warning/success) and metric highlight cards
- **NL parsing indicator** shows "AI is parsing your command..." while processing
- Keyboard navigation with arrow keys and Enter

---

## AI Model Architecture

ExoTask uses a **dual-model routing strategy** to balance speed and reasoning quality:

### Groq (LLaMA 3.3 70B) — Fast Path
Used for latency-sensitive operations where sub-200ms response time matters:

| Route | Purpose | Why Groq |
|-------|---------|----------|
| `/api/ai/suggest` | Inline task suggestions (priority, assignee, estimate) | Fires on 500ms debounce while user types |
| `/api/ai/parse-command` | Natural language → structured task | Must feel instant in the command bar |
| `/api/ai/query` | Team/task queries from command bar | Inline results need to appear quickly |

All Groq calls use `response_format: { type: "json_object" }` for reliable structured output.

### Anthropic Claude (Haiku 4.5) — Deep Path
Used for analytical tasks where reasoning quality matters more than speed:

| Route | Purpose | Why Claude |
|-------|---------|------------|
| `/api/agents/task-analyzer` | Full team workload analysis | Needs to synthesize complex team dynamics |
| `/api/agents/daily-digest` | Morning standup generation | Requires personality, narrative, and nuance |
| `/api/ai/decompose` | Task → subtask decomposition | Must reason about dependencies and skill matching |
| `/api/ai/prep-one-on-one` | 1:1 meeting preparation | Needs empathetic, manager-appropriate analysis |

---

## AI Agents — The Brain

Six autonomous agents run on configurable schedules, each with a specific responsibility. They operate independently and post all activity to a dedicated Slack channel with rich Block Kit formatting.

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
4. **DMs assignees directly** via Slack for overdue and critical tasks
5. Posts a color-coded summary to the agent channel

---

### 4. Daily Digest
**Schedule:** Once per day (every 1440 minutes) | **Route:** `POST /api/agents/daily-digest`

The morning standup host. Uses Claude AI to generate a full daily briefing.

**Output format:**
- `:coffee: *Good morning, team!*` — warm greeting with personality
- `:white_check_mark: *Yesterday's Wins*` — completed tasks or note if none
- `:clipboard: *Today's Board*` — each task with colored circle health indicator
- `:warning: *Blockers & Red Flags*` — anything blocked, overdue, or suspiciously quiet
- `:dart: *Today's Priorities*` — 2-3 numbered action items
- Motivational one-liner closing

---

### 5. Risk Predictor
**Schedule:** Every 60 minutes | **Route:** `POST /api/agents/risk-predictor`

The risk engine. Uses deterministic multi-factor scoring to assess delivery risk for every active task. See [Risk Scoring Engine](#risk-scoring-engine) for the full algorithm.

**What it does:**
1. Fetches all active tasks with joined assignee data (performance metrics)
2. Computes a 0–100 risk score for each task using sigmoid normalization
3. Stores high-risk alerts (score >= 60) as `ai_insights` records
4. Detects workload imbalances using priority-weighted effective load per employee
5. Creates `ai_proposals` for workload rebalancing when imbalances are detected
6. Posts risk summaries and rebalancing suggestions to Slack

**Workload balancing algorithm:**
- Computes effective load per employee: `remaining_hours × priority_weight` (P0=4x, P1=3x, P2=2x, P3=1x)
- Identifies overloaded employees (load > 2× team average)
- Identifies underloaded employees (load < 0.5× team average)
- Proposes transferring lowest-priority pending tasks from overloaded to underloaded

---

### 6. Performance Snapshotter
**Schedule:** Once per day (every 1440 minutes) | **Route:** `POST /api/agents/performance-snapshotter`

The metrics historian. Captures daily performance snapshots for trend analysis and 1:1 meeting prep.

**What it does:**
1. Fetches all active employees and their current metrics
2. Counts active tasks per employee
3. Creates a `performance_snapshots` record per employee per day
4. Deduplicates — skips if a snapshot already exists for today
5. Reports creation/skip counts to Slack

**Captured metrics:**
- `tasks_completed` — total at snapshot time
- `on_time_percentage` — percentage of tasks completed before deadline
- `avg_variance_ratio` — average of actual_hours / ai_estimate_hours
- `avg_response_minutes` — average response time to tracker pings
- `active_task_count` — number of in-progress tasks at snapshot time

---

## AI Intelligence Layer

Beyond the agents, ExoTask provides several AI-powered capabilities accessible from the UI:

### Natural Language Task Creation
**Route:** `POST /api/ai/parse-command` | **Model:** Groq

Type anything natural in the command bar — the AI parses it into structured task data:
- Input: `"assign prash to fix the login page by friday, high priority"`
- Output: `{ title: "Fix the login page", assignee_id: "<prashant's UUID>", priority: "P1", due_at: "2026-03-13T17:00:00Z" }`

Handles fuzzy name matching ("prash" → Prashant), relative dates ("tomorrow", "in 2 days", "friday"), and priority inference.

### AI Task Suggestions
**Route:** `POST /api/ai/suggest` | **Model:** Groq

Fires automatically when creating tasks (500ms debounce after 3+ characters). Returns:
- Suggested priority (P0–P3)
- Recommended assignee with reasoning (considers workload, skill match, availability)
- Estimated hours to complete
- Suggested deadline

The `estimate_hours` is saved to `ai_estimate_hours` on the task. Suggestions appear as a pill below the input.

### Task Decomposition
**Route:** `POST /api/ai/decompose` | **Model:** Claude Haiku

Breaks a large task into 3–7 subtasks with:
- Clear subtask titles
- Hour estimates (calibrated by assignee's variance ratio)
- Suggested assignee with reasoning
- Priority levels
- Dependency ordering (which subtask depends on which)
- Overall approach summary

Accessible via the "Generate Plan" button in the task detail panel.

### AI Query Engine
**Route:** `POST /api/ai/query` | **Model:** Groq

Ask questions about your team and tasks from the command bar:
- `?who is overloaded` — analyzes workload distribution
- `?what's at risk` — identifies high-risk tasks
- `?how is prashant doing` — individual performance summary

Returns structured responses with type (info/warning/success) and optional metric highlight cards.

### 1:1 Meeting Preparation
**Route:** `POST /api/ai/prep-one-on-one` | **Model:** Claude Haiku

Generates comprehensive meeting prep notes for manager-employee 1:1s. Uses employee data, active tasks, completed tasks, team averages, and performance snapshots. Returns:
- **Praise points** — specific accomplishments to recognize
- **Discussion items** — areas needing attention
- **Goals** — suggested objectives for the next period
- **Risks** — potential issues to address proactively
- **Talking points** — conversation starters
- **Overall assessment** — summary with sentiment

Accessible via the "1:1 Prep" button in the Stats view employee table.

### Calibrated Estimation
When a task is marked as `done`:
1. `actual_hours` is calculated: `(now - started_at) / 3600000`, rounded to 1 decimal
2. Employee stats are recalculated across ALL completed tasks:
   - `tasks_completed`: total count
   - `avg_variance_ratio`: average of `actual_hours / ai_estimate_hours`
   - `on_time_percentage`: percentage where `completed_at <= due_at`
3. Future AI estimates are multiplied by the assignee's variance ratio for calibrated predictions

---

## AI Proposals System

AI agents can suggest actions, but they never execute them automatically. Instead, they create **proposals** that humans review.

### Proposal Types
| Action | Description | Created By |
|--------|-------------|------------|
| `reassign` | Move a task from an overloaded person to someone with capacity | Risk Predictor |
| `extend_deadline` | Push a deadline when progress indicates it's unreachable | Risk Predictor |
| `escalate_priority` | Bump priority when risk factors indicate urgency | Risk Predictor |
| `decompose` | Break a large task into subtasks | Task Analyzer |
| `rebalance` | Redistribute work across the team | Risk Predictor |

### Proposals Panel (Bell Icon)
- Click the bell icon in the header to open the Proposals Panel
- Shows all pending proposals with:
  - Action type icon and label
  - Which agent created it and when
  - Reasoning explanation
- **Approve** — executes the proposed change (e.g., reassigns the task, extends the deadline)
- **Reject** — dismisses the proposal without action

### Proposal Execution (`POST /api/proposals`)
When approved, the system automatically executes:
- **reassign**: Updates `assignee_id` on the task
- **extend_deadline**: Adds proposed hours to `due_at`
- **escalate_priority**: Updates `priority` on the task

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
7. **Manager notification** — When escalation reaches `manager` level, the system DMs the manager with full context

**Response endpoint:** Developers can respond via `POST /api/tasks/[id]/respond` which resets the escalation chain.

---

## Risk Scoring Engine

The Risk Predictor agent uses a deterministic, multi-factor algorithm to score tasks from 0–100.

### Risk Factors (Raw Points)

| Factor | Max Points | Triggers |
|--------|-----------|----------|
| **Time Pressure** | 30 | Overdue (+30), Due < 4h (+25), Due < 24h (+15) |
| **Progress Gap** | 25 | Behind expected by 40%+ (+25), 20%+ (+15), 10%+ (+8) |
| **Assignee Reliability** | 20 | On-time rate < 70% (+20), < 85% (+10), Variance > 1.5x (+10) |
| **Responsiveness** | 15 | No response > 4h after ping (+15), > 1h (+8) |
| **Priority Urgency** | 10 | P0 (+10), P1 (+5) |
| **Blocked Status** | 15 | Task is blocked (+15) |

### Progress Gap Calculation
Expected progress is computed using calibrated estimates:
```
calibratedEstimate = ai_estimate_hours × assignee.avg_variance_ratio
expectedProgress = min((elapsedHours / calibratedEstimate) × 100, 100)
progressGap = expectedProgress - task.progress_percent
```

### Sigmoid Normalization
Raw points are normalized to 0–100 using a sigmoid curve:
```
score = min(sigmoid((rawPoints - 30) / 15) × 100, 100)
```
This creates a natural S-curve where moderate risk starts around 30 points and saturates near 100 at ~60+ points.

### Risk Levels
| Score | Level | Badge Color |
|-------|-------|-------------|
| 60–100 | High Risk | Red |
| 35–59 | Medium Risk | Yellow |
| 0–34 | Low Risk | Green |

---

## Slack Integration

### Setup Requirements
- Slack app with scopes: `chat:write`, `im:write`, `im:read`, `users:read`
- Bot token (`xoxb-...`) in `SLACK_BOT_TOKEN`
- Dedicated channel for agent activity (e.g., `#exotask-agents`), channel ID in `SLACK_AGENT_CHANNEL_ID`
- Employee Slack user IDs stored in the `employees.slack_id` column

### Agent Activity Logging
Each agent has a unique visual identity in Slack:

| Agent | Emoji | Color | Tagline |
|-------|-------|-------|---------|
| Task Analyzer | :crystal_ball: | Purple `#6C5CE7` | Strategic Analysis |
| Daily Digest | :newspaper: | Green `#00B894` | Morning Briefing |
| Deadline Guardian | :shield: | Red `#E17055` | Deadline Enforcement |
| Update Checker | :satellite_antenna: | Blue `#0984E3` | Activity Monitor |
| Risk Predictor | :robot_face: | Gray `#636E72` | Agent |
| Performance Snapshotter | :robot_face: | Gray `#636E72` | Agent |

Messages use Block Kit attachments with colored sidebars, formatted sections, and IST-timestamped footers.

### Slack Slash Commands (`POST /api/slack/commands`)

| Command | Example | Description |
|---------|---------|-------------|
| `/task` | `/task @prashant Fix auth P1 --due tomorrow` | Create a task from Slack |
| `/tasks` | `/tasks @prashant` or `/tasks team` | List active tasks |
| `/status` | `/status 70% Almost done` | Update progress on your latest task |
| `/done` | `/done` | Mark your latest task as completed |
| `/track` | `/track` | Tracker configuration (points to web UI) |

### Fallback Behavior
When `SLACK_BOT_TOKEN` is not configured, all Slack messages are logged to the server console instead. The system functions fully without Slack — it's an optional notification layer.

---

## Frontend Application

### Main Page (`src/app/page.tsx`)
Single-page app with three views switchable via the sidebar:
- **Tasks view** — task list with inline creation and detail panel
- **Stats view** — team performance dashboard with AI analysis and 1:1 prep
- **Tracker view** — agent monitoring and control (6 agents)

### Sidebar (`src/components/sidebar.tsx`)
- Navigation: Tasks, Stats, Agents
- Team member list with avatar initials and active task counts
- Click a team member to filter the task list to their tasks

### Task List (`src/components/task-list.tsx`)
- **Inline task creation** with @mention autocomplete dropdown (arrow keys + Tab/Enter)
- **Priority selector buttons** (P0–P3) in the creation toolbar
- **Assignee chip** with remove button
- **AI suggestion pill** appears below input after 500ms debounce
- Tasks displayed with status icon, priority badge, title, assignee avatar, progress bar
- Expandable subtasks (chevron toggle)
- Tracker and overdue indicators

### Task Detail (`src/components/task-detail.tsx`)
- Full metadata display with risk score badge and calibrated estimates
- Status workflow buttons, progress slider, tracker controls
- AI decomposition: Generate Plan → preview → Apply Plan
- Activity timeline with formatted timestamps

### Command Bar (`src/components/command-bar.tsx`)
- Three-mode command palette: `/task` syntax, natural language, `?` queries
- Inline AI query results with metric highlight cards
- Footer showing all three input modes

### Stats View (`src/components/stats-view.tsx`)
- **Summary cards**: total tasks, completion rate, average variance, team size
- **Per-employee table** with tasks completed, on-time %, variance ratio, active count
- **AI Analysis button** — triggers Task Analyzer on-demand
- **1:1 Prep button** per employee — generates meeting prep notes via Claude
- **1:1 Prep modal** with sections: praise, discuss, goals, risks, talking points, overall assessment

### Proposals Panel (`src/components/proposals-panel.tsx`)
- Modal panel opened via bell icon in the header
- Lists pending AI proposals with action type icons
- Approve/reject buttons with loading state
- Auto-refreshes task list on action

### Tracker/Agent View (`src/components/tracker-view.tsx`)
- **Agent cards** for all 6 agents showing status, last run time, and results
- Run and toggle buttons for manual control
- Tracked tasks section with escalation levels and ping times

---

## Architecture & API Reference

```
Next.js 16 App Router (TypeScript)
|-- src/app/
|   |-- page.tsx                              -- Main SPA entry point
|   |-- layout.tsx                            -- Root layout with Geist font
|   |-- globals.css                           -- Tailwind v4 styles
|   |-- api/
|       |-- agents/
|       |   |-- update-checker/route.ts       -- POST: ping & escalation engine
|       |   |-- task-analyzer/route.ts        -- POST: AI workload analysis (Claude)
|       |   |-- deadline-guardian/route.ts     -- POST: deadline monitoring
|       |   |-- daily-digest/route.ts         -- POST: AI daily standup (Claude)
|       |   |-- risk-predictor/route.ts       -- POST: risk scoring & rebalancing
|       |   |-- performance-snapshotter/route.ts -- POST: daily metrics capture
|       |-- ai/
|       |   |-- suggest/route.ts              -- POST: task suggestions (Groq)
|       |   |-- parse-command/route.ts        -- POST: NL → structured task (Groq)
|       |   |-- query/route.ts               -- POST: AI query answering (Groq)
|       |   |-- decompose/route.ts           -- POST: task decomposition (Claude)
|       |   |-- prep-one-on-one/route.ts     -- POST: 1:1 meeting prep (Claude)
|       |-- proposals/route.ts               -- GET: list, POST: approve/reject
|       |-- cron/route.ts                    -- GET: unified cron dispatcher
|       |-- tasks/
|       |   |-- [id]/respond/route.ts        -- POST: developer response endpoint
|       |-- tracker/route.ts                 -- POST: legacy tracker (queue-based)
|       |-- slack/
|           |-- commands/route.ts            -- POST: Slack slash command handler
|-- src/components/
|   |-- task-list.tsx                        -- Task board with inline creation + @mention
|   |-- task-detail.tsx                      -- Task detail with risk score + decomposition
|   |-- tracker-view.tsx                     -- Agent dashboard (6 agents)
|   |-- stats-view.tsx                       -- Team metrics + 1:1 prep
|   |-- sidebar.tsx                          -- Navigation & team list
|   |-- command-bar.tsx                      -- Cmd+K palette (3 modes)
|   |-- proposals-panel.tsx                  -- AI proposal review panel
|-- src/lib/
|   |-- slack.ts                             -- Slack client, DMs, Block Kit posts
|   |-- agents/
|   |   |-- registry.ts                      -- Agent config singleton (6 agents)
|   |   |-- types.ts                         -- Agent type definitions
|   |-- hooks/
|   |   |-- use-tasks.ts                     -- Task CRUD, auto-estimation, realtime
|   |-- supabase/
|   |   |-- client.ts                        -- Supabase browser client
|   |   |-- types.ts                         -- Full database type definitions
|   |-- utils.ts                             -- UI utilities
|   |-- mock-data.ts                         -- Fallback mock employees
|   |-- mock-store.ts                        -- In-memory mock task store
|-- supabase/
|   |-- migrations/
|       |-- 001_ai_tables.sql                -- AI tables migration
|-- vercel.json                              -- Cron configuration
|-- .env.example                             -- Environment variable template
```

### API Routes

| Route | Method | Model | Description |
|-------|--------|-------|-------------|
| `/api/agents/update-checker` | POST | — | Ping & escalation engine |
| `/api/agents/task-analyzer` | POST | Claude | AI workload analysis |
| `/api/agents/deadline-guardian` | POST | — | Deadline monitoring & alerts |
| `/api/agents/daily-digest` | POST | Claude | AI daily standup generation |
| `/api/agents/risk-predictor` | POST | — | Risk scoring & rebalancing proposals |
| `/api/agents/performance-snapshotter` | POST | — | Daily metrics capture |
| `/api/ai/suggest` | POST | Groq | Inline task suggestions |
| `/api/ai/parse-command` | POST | Groq | Natural language → structured task |
| `/api/ai/query` | POST | Groq | AI query answering |
| `/api/ai/decompose` | POST | Claude | Task decomposition into subtasks |
| `/api/ai/prep-one-on-one` | POST | Claude | 1:1 meeting preparation |
| `/api/proposals` | GET | — | List proposals by status |
| `/api/proposals` | POST | — | Approve/reject a proposal |
| `/api/cron` | GET | — | Unified cron dispatcher |
| `/api/tasks/[id]/respond` | POST | — | Developer response endpoint |
| `/api/tracker` | POST | — | Legacy queue-based tracker |
| `/api/slack/commands` | POST | — | Slack slash command handler |

---

## Database Schema

### Core Tables

#### `employees`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `name` | text | required | Full name |
| `nickname` | text | null | Short name for messages |
| `email` | text | required | Email address |
| `avatar_url` | text | null | Profile image URL |
| `slack_id` | text | null | Slack user ID for DMs |
| `discord_id` | text | null | Discord user ID (future) |
| `phone` | text | null | Phone number for voice escalation |
| `whatsapp` | text | null | WhatsApp number |
| `role` | text | 'developer' | `developer`, `lead`, or `manager` |
| `avg_variance_ratio` | float | 1.0 | Rolling actual/estimated hours ratio |
| `avg_response_minutes` | float | 0 | Average response time to pings |
| `tasks_completed` | int | 0 | Total completed count |
| `on_time_percentage` | float | 100 | % completed before deadline |
| `is_active` | boolean | true | Whether active |
| `created_at` | timestamp | now() | Created |
| `updated_at` | timestamp | now() | Updated |

#### `tasks`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `parent_id` | uuid | null | FK to tasks (subtasks) |
| `title` | text | required | Task title |
| `description` | text | null | Full description |
| `status` | text | 'pending' | `pending`, `acknowledged`, `in_progress`, `blocked`, `review`, `done`, `cancelled` |
| `priority` | text | 'P2' | `P0`, `P1`, `P2`, `P3` |
| `assignee_id` | uuid | null | FK to employees |
| `created_by_id` | uuid | null | FK to employees |
| `ai_estimate_hours` | float | null | AI-generated hour estimate |
| `actual_hours` | float | null | Calculated on completion |
| `due_at` | timestamp | null | Deadline |
| `started_at` | timestamp | null | When work began |
| `completed_at` | timestamp | null | When marked done |
| `tracker_enabled` | boolean | false | Whether escalation tracking is on |
| `tracker_interval_minutes` | int | 60 | Base ping interval |
| `current_escalation` | text | 'slack' | Current escalation level |
| `last_ping_at` | timestamp | null | Last tracker ping |
| `last_response_at` | timestamp | null | Last developer response |
| `progress_percent` | int | 0 | 0–100 progress |
| `sort_order` | int | 0 | Display ordering |
| `created_at` | timestamp | now() | Created |
| `updated_at` | timestamp | now() | Updated |

#### `task_activity`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `task_id` | uuid | null | FK to tasks |
| `actor_id` | uuid | null | FK to employees (null for agents) |
| `activity_type` | text | required | `created`, `status_change`, `progress_update`, `assigned`, `reassigned`, `comment`, `tracker_ping`, `tracker_response`, `escalation`, `completed`, `due_date_changed` |
| `message` | text | null | Human-readable description |
| `metadata` | jsonb | {} | Structured event data |
| `created_at` | timestamp | now() | Event time |

#### `tracker_queue`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `task_id` | uuid | required | FK to tasks |
| `next_check_at` | timestamp | required | When to next check |
| `escalation_level` | text | 'slack' | Current level |
| `attempts_at_current_level` | int | 0 | Ping count at level |
| `is_active` | boolean | true | Whether active |
| `created_at` | timestamp | now() | Created |

### AI Tables

#### `ai_insights`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `type` | text | required | `risk_alert`, `rebalance_suggestion`, `pattern_observation`, `decomposition` |
| `task_id` | uuid | null | FK to tasks |
| `employee_id` | uuid | null | FK to employees |
| `message` | text | required | Human-readable insight |
| `metadata` | jsonb | {} | Structured data (risk_score, factors, etc.) |
| `status` | text | 'pending' | `pending`, `acknowledged`, `resolved` |
| `created_at` | timestamp | now() | Created |

#### `ai_proposals`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `agent_id` | text | required | Which agent created this |
| `action_type` | text | required | `reassign`, `extend_deadline`, `escalate_priority`, `decompose`, `rebalance` |
| `target_task_id` | uuid | null | FK to tasks |
| `proposed_changes` | jsonb | {} | What to change (e.g., `{new_assignee_id, old_assignee_id}`) |
| `reasoning` | text | required | Why this action is suggested |
| `status` | text | 'pending' | `pending`, `approved`, `rejected` |
| `reviewed_at` | timestamp | null | When reviewed |
| `created_at` | timestamp | now() | Created |

#### `performance_snapshots`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `employee_id` | uuid | required | FK to employees |
| `snapshot_date` | date | required | The date of capture |
| `tasks_completed` | int | 0 | Total at snapshot time |
| `on_time_percentage` | numeric(5,2) | 0 | On-time rate |
| `avg_variance_ratio` | numeric(5,2) | 1.0 | Estimation accuracy |
| `avg_response_minutes` | numeric(8,2) | 0 | Response speed |
| `active_task_count` | int | 0 | Active tasks at capture |
| `created_at` | timestamp | now() | Created |

Unique constraint on `(employee_id, snapshot_date)` prevents duplicate daily snapshots.

---

## Type System

All types are defined in `src/lib/supabase/types.ts`:

```typescript
// Status & Priority
type TaskStatus = "pending" | "acknowledged" | "in_progress" | "blocked" | "review" | "done" | "cancelled";
type TaskPriority = "P0" | "P1" | "P2" | "P3";
type EscalationLevel = "slack" | "whatsapp" | "phone" | "manager";

// AI Types
type InsightType = "risk_alert" | "rebalance_suggestion" | "pattern_observation" | "decomposition";
type InsightStatus = "pending" | "acknowledged" | "dismissed";
type ProposalAction = "reassign" | "extend_deadline" | "escalate_priority" | "decompose" | "rebalance";
type ProposalStatus = "pending" | "approved" | "rejected";

// Core Interfaces: Employee, Task, TaskActivity, TrackerQueue
// AI Interfaces: AIInsight, AIProposal, PerformanceSnapshot
```

Agent types in `src/lib/agents/types.ts`:
```typescript
type AgentStatus = "idle" | "running" | "error" | "disabled";

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  interval_minutes: number;
  enabled: boolean;
  last_run_at: string | null;
  last_result: AgentRunResult | null;
  status: AgentStatus;
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
      "schedule": "0 0 * * *"
    }
  ]
}
```

The cron runs daily (Vercel Hobby plan limitation). Agents can also be triggered manually from the Tracker View or via `curl`.

### Cron Dispatcher (`/api/cron/route.ts`)
The dispatcher maintains an in-memory `lastRun` map and checks each agent's interval:

| Agent | Interval | Frequency |
|-------|----------|-----------|
| Update Checker | 5 min | Most frequent |
| Deadline Guardian | 30 min | Every 30 min |
| Task Analyzer | 60 min | Hourly |
| Risk Predictor | 60 min | Hourly |
| Daily Digest | 1440 min | Once per day |
| Performance Snapshotter | 1440 min | Once per day |

The `lastRun` map resets on cold start (Vercel serverless), but all agents are idempotent.

Optional `CRON_SECRET` authentication via Bearer token for production security.

### Manual Agent Execution
```bash
# Individual agents
curl -X POST http://localhost:3000/api/agents/risk-predictor
curl -X POST http://localhost:3000/api/agents/performance-snapshotter
curl -X POST http://localhost:3000/api/agents/task-analyzer
curl -X POST http://localhost:3000/api/agents/deadline-guardian
curl -X POST http://localhost:3000/api/agents/daily-digest
curl -X POST http://localhost:3000/api/agents/update-checker

# All agents via dispatcher
curl http://localhost:3000/api/cron
```

---

## Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | Next.js (App Router) | 16.1.6 | Full-stack React framework |
| Language | TypeScript | 5.x | Type-safe development |
| UI | React | 19.2.3 | Component library |
| Styling | Tailwind CSS | v4 | Utility-first CSS |
| Database | Supabase (PostgreSQL) | 2.98.0 | Realtime database + auth |
| AI (Fast) | Groq (LLaMA 3.3 70B) | 0.37.0 | Sub-200ms inline AI |
| AI (Deep) | Anthropic Claude Haiku 4.5 | 0.78.0 | Analytical reasoning |
| Messaging | Slack Web API | 7.14.1 | Team notifications |
| UI Components | Radix UI | Latest | Accessible primitives |
| Command Palette | cmdk | 1.1.1 | Cmd+K interface |
| Icons | Lucide React | 0.577.0 | Icon library |
| Date Utils | date-fns | 4.1.0 | Date formatting |
| CSS Utilities | clsx + tailwind-merge | Latest | Class merging |
| Deployment | Vercel | — | Serverless + cron |

---

## Environment Variables

```env
# Required — Database
NEXT_PUBLIC_SUPABASE_URL=         # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase anonymous/publishable key
SUPABASE_SERVICE_ROLE_KEY=        # Service role key (bypasses RLS)

# Required — AI
ANTHROPIC_API_KEY=                # For Claude (agents, decompose, 1:1 prep)
GROQ_API_KEY=                     # For Groq (suggest, parse-command, query)

# Slack Integration
SLACK_BOT_TOKEN=                  # Slack bot token (xoxb-...)
SLACK_AGENT_CHANNEL_ID=           # Channel ID for agent activity posts

# Security
CRON_SECRET=                      # Bearer token for cron endpoint auth
```

If `NEXT_PUBLIC_SUPABASE_URL` is empty or not set, the app falls back to mock mode with in-memory data.

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project with the schema tables created
- An Anthropic API key (for Claude-powered agents)
- A Groq API key (for fast inline AI)
- (Optional) A Slack workspace with a bot app installed

### Installation

```bash
npm install
```

### Configure Environment

```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

### Set Up Database

Run the core table creation SQL in Supabase SQL Editor (employees, tasks, task_activity, tracker_queue), then run the AI tables migration:

```bash
# Copy contents of supabase/migrations/001_ai_tables.sql
# Paste into Supabase Dashboard > SQL Editor > Run
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Test Agents

```bash
# Run all agents at once
curl http://localhost:3000/api/cron

# Or individually
curl -X POST http://localhost:3000/api/agents/risk-predictor
curl -X POST http://localhost:3000/api/agents/task-analyzer
```

### Set Up Slack (Optional)

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Add OAuth scopes: `chat:write`, `im:write`, `im:read`, `users:read`
3. Install to workspace, copy Bot Token to `SLACK_BOT_TOKEN`
4. Create `#exotask-agents` channel, copy ID to `SLACK_AGENT_CHANNEL_ID`
5. Update `slack_id` column in `employees` table for each team member

### Set Up Slash Commands (Optional)

In Slack app settings, point all commands to your deployed URL:
- `/task`, `/tasks`, `/status`, `/done`, `/track` → `https://your-domain.com/api/slack/commands`

---

## Deployment

### Vercel

```bash
vercel deploy --prod
```

Set all environment variables in Vercel Dashboard > Settings > Environment Variables.

The `vercel.json` configures a daily cron job automatically. For more frequent agent runs, upgrade to Vercel Pro (supports `*/5 * * * *`).

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

- **WhatsApp escalation** — Twilio WhatsApp API for Level 2 escalation
- **Phone call escalation** — Twilio Voice API for Level 3 with spoken notifications
- **Slack signing verification** — Validate `x-slack-signature` headers
- **Slack interactivity** — Button-based responses in DMs ("Mark as done", "Update progress")
- **Sprint planning agent** — AI agent that suggests sprint scope based on velocity and capacity
- **Retrospective agent** — End-of-sprint analysis with variance trends and velocity charts
- **Performance trend charts** — Visualize snapshots over time in the Stats view
- **GitHub/GitLab integration** — Auto-link commits and PRs to tasks
- **Mobile notifications** — Push notifications for critical escalations
- **Multi-team support** — Separate agent channels and manager hierarchies
