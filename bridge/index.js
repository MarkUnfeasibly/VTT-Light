// /bridge/index.js
// ---------------------------------------------------------------------------
// Discord <-> POPS relay for VTT-Light.
//
//   Discord message  ->  Firebase Realtime Database `pops_log`  ->  POPS panel
//   @POPS mention    ->  existing RAG + SLM backend             ->  Discord + POPS
//   POPS message     ->  Discord channel                        (optional mirror)
//
// The bot token is a secret and must stay on the machine running this script.
// Nothing here is bundled into the web app.
// ---------------------------------------------------------------------------

import "dotenv/config";
import { Client, GatewayIntentBits, Events } from "discord.js";

const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const DB_URL = (
  process.env.FIREBASE_DB_URL ||
  "https://vtt-light-default-rtdb.europe-west1.firebasedatabase.app"
).replace(/\/+$/, "");
const RAG_API_URL =
  process.env.RAG_API_URL ||
  "https://traveller-rag-api-600932660900.us-central1.run.app/search";
const SLM_API_URL =
  process.env.SLM_API_URL ||
  "https://traveller-slm-service-600932660900.us-central1.run.app/api/generate";
const POPS_NAME = "POPS";

if (!DISCORD_TOKEN) {
  console.error(
    "[bridge] DISCORD_TOKEN is missing. Copy bridge/.env.example to bridge/.env and add your bot token."
  );
  process.exit(1);
}

const list = (value) =>
  (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const WATCHED = new Set(list(process.env.DISCORD_CHANNELS));
const AI_CHANNELS = new Set(list(process.env.DISCORD_AI_CHANNELS));
const MIRROR = String(process.env.MIRROR_POPS || "").toLowerCase() === "true";
const MIRROR_CHANNEL_ID = (process.env.MIRROR_CHANNEL || "").trim();
const WATCH_ALL = WATCHED.size === 0;
const DEDUPE_LIMIT = 2000;

const log = (...args) => console.log("[bridge]", ...args);
const warn = (...args) => console.warn("[bridge]", ...args);

// --- POPS database -----------------------------------------------------------

async function postPops(entry) {
  const res = await fetch(`${DB_URL}/pops_log.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timestamp: Date.now(), ...entry }),
  });
  if (!res.ok) {
    throw new Error(`RTDB write failed (${res.status}): ${await res.text()}`);
  }
}

// --- POPS AI (same two-stage RAG + SLM flow as src/pops.js) ------------------

async function fetchJson(url, body, timeoutMs) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      warn(`request failed (attempt ${attempt + 1}/2):`, err.message);
    }
  }
  throw lastErr;
}

async function askPops(question) {
  const started = Date.now();
  try {
    const ragData = await fetchJson(RAG_API_URL, { query: question }, 60000);
    const context = ragData.context || "";
    const prompt = context ? `${context}\n\nUser Question: ${question}` : question;

    const slmData = await fetchJson(
      SLM_API_URL,
      {
        model: "traveller-slm",
        prompt,
        options: { temperature: 0.0, top_p: 0.8 },
        stream: false,
      },
      120000
    );
    log(`AI answered in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return slmData.response || "POPS processing error: Null response.";
  } catch (err) {
    warn("POPS AI error:", err.message);
    return "POPS status: Peripheral offline or unresponsive.";
  }
}

// --- helpers -----------------------------------------------------------------

function chunk(text, size = 1900) {
  const out = [];
  let rest = String(text);
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.6) cut = rest.lastIndexOf(" ", size);
    if (cut < size * 0.6) cut = size;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

const senderName = (message) =>
  message.member?.displayName ||
  message.author.globalName ||
  message.author.username;

// --- Discord client ----------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let mirrorChannel = null;

client.once(Events.ClientReady, async (c) => {
  log(`connected as ${c.user.tag} (${c.user.id})`);

  if (WATCH_ALL) {
    warn(
      "DISCORD_CHANNELS is empty - relaying EVERY guild text channel the bot can read."
    );
  }

  if (MIRROR) {
    const id = MIRROR_CHANNEL_ID || [...WATCHED][0];
    const channel = id
      ? await c.channels.fetch(id).catch(() => null)
      : c.channels.cache.find(
          (ch) => ch.isTextBased?.() && !ch.isDMBased?.() && ch.guild
        );
    if (channel?.isTextBased?.()) {
      mirrorChannel = channel;
      log(`mirroring POPS to #${channel.name}`);
    } else {
      warn("MIRROR_POPS is on but no usable MIRROR_CHANNEL was found.");
    }
    startMirrorLoop();
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.inGuild() || message.author.bot) return;

    const mentioned = client.user ? message.mentions.has(client.user) : false;
    const watched = WATCH_ALL || WATCHED.has(message.channelId);
    const aiChannel = AI_CHANNELS.has(message.channelId);
    if (!watched && !mentioned && !aiChannel) return;

    const mentionRe = new RegExp(`<@!?${client.user.id}>`, "g");
    const raw = (message.content || "").trim();
    if (!raw) return;
    const display = raw.replace(mentionRe, "@POPS");

    if (watched || aiChannel) {
      await postPops({
        sender: senderName(message),
        text: display,
        type: "discord",
        via: "discord",
        channel: message.channel.name,
        discordId: message.author.id,
        guildId: message.guildId,
        avatar: message.author.displayAvatarURL({ extension: "png", size: 64 }),
      });
      log(`relayed ${message.author.username}: ${display.slice(0, 80)}`);
    }

    if (mentioned || aiChannel) {
      const question = raw.replace(mentionRe, "").trim();
      if (!question) return;
      log(`AI question from ${message.author.username}: ${question.slice(0, 80)}`);

      await message.channel.sendTyping().catch(() => {});
      const answer = await askPops(question);

      await postPops({
        sender: POPS_NAME,
        text: answer,
        type: "answer",
        via: "bridge",
      });

      const parts = chunk(answer);
      for (let i = 0; i < parts.length; i += 1) {
        const payload = {
          content: parts[i],
          allowedMentions: { parse: [], repliedUser: false },
        };
        if (i === 0) {
          await message.reply(payload).catch(() => message.channel.send(payload));
        } else {
          await message.channel.send(payload).catch(() => {});
        }
      }
    }
  } catch (err) {
    warn("message handling failed:", err.message);
  }
});

client.on(Events.Error, (err) => warn("client error:", err.message));
process.on("unhandledRejection", (err) =>
  warn("unhandled rejection:", err?.message || err)
);

// --- POPS -> Discord mirror --------------------------------------------------
// Realtime Database exposes an SSE stream. The first `put` at "/" is the whole
// log; seed the key set from it so history is not replayed into Discord.

const seenKeys = new Set();
let seeded = false;

function remember(key) {
  seenKeys.add(key);
  if (seenKeys.size > DEDUPE_LIMIT) {
    // Sets preserve insertion order; drop the oldest keys.
    const drop = seenKeys.size - DEDUPE_LIMIT;
    let n = 0;
    for (const k of seenKeys) {
      seenKeys.delete(k);
      if (++n >= drop) break;
    }
  }
}

function considerMirror(key, entry) {
  if (!entry || typeof entry.text !== "string") return;
  if (entry.via === "discord" || entry.via === "bridge") return; // no echo
  if (!mirrorChannel) return;

  const label = entry.sender || (entry.type === "answer" ? POPS_NAME : "Crew");
  const suffix =
    entry.type === "answer" ? " (POPS)" : entry.type === "roll" ? " 🎲" : "";
  const content = `**${label}**${suffix}: ${entry.text}`;
  for (const part of chunk(content)) {
    mirrorChannel
      .send({ content: part, allowedMentions: { parse: [] } })
      .catch((err) => warn("mirror send failed:", err.message));
  }
}

function handleEvent(eventName, raw) {
  if (!raw) return;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const path = payload.path || "/";
  const data = payload.data;

  if (eventName === "put" && (path === "/" || path === "")) {
    if (!seeded) {
      for (const key of Object.keys(data || {})) remember(key);
      seeded = true;
    }
    return;
  }

  if (eventName === "put" && path !== "/") {
    const key = path.replace(/^\//, "");
    if (!key || key.includes("/")) return;
    if (seenKeys.has(key)) return;
    remember(key);
    considerMirror(key, data);
    return;
  }

  if (eventName === "patch" && data && typeof data === "object") {
    for (const [key, entry] of Object.entries(data)) {
      if (seenKeys.has(key)) continue;
      remember(key);
      considerMirror(key, entry);
    }
  }
}

async function startMirrorLoop() {
  let backoff = 2000;
  for (;;) {
    try {
      log("opening POPS stream…");
      const res = await fetch(`${DB_URL}/pops_log.json`, {
        headers: { Accept: "text/event-stream" },
      });
      if (!res.ok || !res.body) {
        throw new Error(`SSE ${res.status}`);
      }
      backoff = 2000;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";
      let dataLines = [];

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).replace(/\r$/, "");
          buffer = buffer.slice(newline + 1);

          if (line === "") {
            if (dataLines.length) handleEvent(eventName, dataLines.join("\n"));
            eventName = "message";
            dataLines = [];
          } else if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          }
        }
      }
    } catch (err) {
      warn("POPS stream dropped:", err.message);
    }
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, 30000);
  }
}

// --- shutdown ----------------------------------------------------------------

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log("shutting down…");
    client.destroy().finally(() => process.exit(0));
  });
}

client.login(DISCORD_TOKEN).catch((err) => {
  console.error("[bridge] Discord login failed:", err.message);
  process.exit(1);
});
