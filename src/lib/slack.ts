import { WebClient } from "@slack/web-api";

const token = process.env.SLACK_BOT_TOKEN;
const AGENT_CHANNEL = process.env.SLACK_AGENT_CHANNEL_ID || "";

export const slack = token ? new WebClient(token) : null;

/** Send a DM to a Slack user by their Slack user ID */
export async function sendSlackDM(
  slackUserId: string,
  text: string
): Promise<boolean> {
  if (!slack) {
    console.log(`[Slack] No token configured. Would DM ${slackUserId}: ${text}`);
    return false;
  }

  try {
    const dm = await slack.conversations.open({ users: slackUserId });
    if (!dm.channel?.id) return false;

    await slack.chat.postMessage({
      channel: dm.channel.id,
      text,
    });
    return true;
  } catch (err) {
    console.error(`[Slack] Failed to DM ${slackUserId}:`, err);
    return false;
  }
}

/** Post a message to a Slack channel */
export async function postToChannel(
  channelId: string,
  text: string
): Promise<boolean> {
  if (!slack) {
    console.log(`[Slack] No token configured. Would post to ${channelId}: ${text}`);
    return false;
  }

  try {
    await slack.chat.postMessage({ channel: channelId, text });
    return true;
  } catch (err) {
    console.error(`[Slack] Failed to post to ${channelId}:`, err);
    return false;
  }
}

const AGENT_CONFIG: Record<string, { emoji: string; color: string; tagline: string }> = {
  "Task Analyzer":    { emoji: ":crystal_ball:",       color: "#6C5CE7", tagline: "Strategic Analysis" },
  "Daily Digest":     { emoji: ":newspaper:",          color: "#00B894", tagline: "Morning Briefing" },
  "Deadline Guardian":{ emoji: ":shield:",             color: "#E17055", tagline: "Deadline Enforcement" },
  "Update Checker":   { emoji: ":satellite_antenna:",  color: "#0984E3", tagline: "Activity Monitor" },
};

/**
 * Post rich agent activity to the #exotask-agents channel.
 * Uses Slack attachments with colored sidebar + Block Kit blocks inside.
 */
export async function logAgentActivity(
  agentName: string,
  headline: string,
  details?: string
): Promise<boolean> {
  if (!slack || !AGENT_CHANNEL) {
    console.log(`[${agentName}] ${headline}${details ? `\n${details}` : ""}`);
    return false;
  }

  const config = AGENT_CONFIG[agentName] || { emoji: ":robot_face:", color: "#636E72", tagline: "Agent" };
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attachmentBlocks: any[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${headline}*`,
      },
    },
  ];

  if (details) {
    // Parse details into visual sections — split on double newlines for separate blocks
    const sections = details.split(/\n{2,}/);
    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;

      // Chunk if too long for a single block (3000 char limit)
      const chunks = splitText(trimmed, 2900);
      for (const chunk of chunks) {
        attachmentBlocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: chunk,
          },
        });
      }
    }
  }

  // Footer context
  attachmentBlocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${config.emoji}  *${config.tagline}*  ·  ${dateStr} at ${timeStr}  ·  _ExoTask AI_`,
      },
    ],
  });

  try {
    await slack.chat.postMessage({
      channel: AGENT_CHANNEL,
      text: `${config.emoji} ${agentName}: ${headline}`,
      attachments: [
        {
          color: config.color,
          blocks: attachmentBlocks,
        },
      ],
      unfurl_links: false,
    });
    return true;
  } catch (err) {
    console.error(`[Slack] Failed to log agent activity:`, err);
    return false;
  }
}

/** Split text into chunks respecting line breaks */
function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt <= 0) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt + 1);
  }
  return chunks;
}
