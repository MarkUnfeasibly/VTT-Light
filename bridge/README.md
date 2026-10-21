# POPS ↔ Discord bridge

Relays Discord chat into the VTT-Light **POPS** panel, answers `@POPS` mentions
with the existing Traveller RAG/SLM backend, and (optionally) mirrors POPS
messages back into Discord.

```
Discord  ──message──▶  bridge  ──write──▶  Firebase `pops_log`  ──▶  POPS panel
POPS     ──SSE──────▶  bridge  ──send───▶  Discord channel        (MIRROR_POPS=true)
@POPS    ──mention──▶  bridge  ──POST───▶  RAG + SLM  ──▶  Discord reply + POPS entry
```

This process holds the **bot token**, so it runs on your machine (or a small
server) — never in the browser or the static site.

---

## 1. Create the Discord application

1. Open <https://discord.com/developers/applications> → **New Application**.
   Name it something like `POPS Relay`.
2. **Bot** tab → **Add Bot** (if prompted).
3. On the Bot page:
   - **Reset Token** → copy it. It is shown once; treat it like a password.
   - Under **Privileged Gateway Intents** enable **Message Content Intent**
     (required — without it Discord sends empty message text). Save changes.
4. **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Bot permissions: `View Channels`, `Send Messages`, `Read Message History`,
     `Embed Links`
   - Open the generated URL, pick your server, **Authorize**.

No slash commands are registered, so `applications.commands` is not needed.

## 2. Get the channel ID

Discord → **User Settings → Advanced → Developer Mode** on. Then right-click the
channel → **Copy Channel ID**.

Shortcut: once the bot is invited and `DISCORD_TOKEN` is in `.env`, run
`npm.cmd run channels` — it prints every server and text channel with its ID.

## 3. Configure and run

```powershell
cd F:\VTT-Light\bridge
copy .env.example .env
notepad .env          # paste DISCORD_TOKEN and DISCORD_CHANNELS
npm.cmd install
npm.cmd start
```

Expected output:

```
[bridge] connected as POPS Relay#1234 (…)
[bridge] relayed Jason: hello
```

While it runs, every message in the configured channels appears in POPS as a
blue/burple Discord entry, and `@POPS <question>` gets a reply in Discord that
is also posted to POPS.

### `.env` reference

| Key | Meaning |
| --- | --- |
| `DISCORD_TOKEN` | Bot token (required). |
| `DISCORD_CHANNELS` | Comma-separated channel IDs to relay. Empty = every readable guild channel. |
| `DISCORD_AI_CHANNELS` | Channels where every message gets an AI answer. Mentions work anywhere. |
| `MIRROR_POPS` | `true` sends POPS questions/answers/rolls to Discord. |
| `MIRROR_CHANNEL` | Destination for the mirror (defaults to the first relayed channel). |
| `FIREBASE_DB_URL` | Realtime Database URL; defaults to the `vtt-light` project. |
| `RAG_API_URL` / `SLM_API_URL` | POPS AI endpoints; defaults match `src/pops.js`. |

## 4. Keep it running

The bridge must stay running for Discord ↔ POPS to work. Options:

- Leave the terminal open during a session (`npm.cmd start`).
- Run it as a Windows scheduled task / service (e.g. NSSM) at logon.
- Or deploy `bridge/` to any small always-on Node host. Firebase Functions
  would need the Blaze plan; plain Cloud Run / a VPS / a Raspberry Pi is enough.

## Notes

- **Message Content Intent** must be enabled or `message.content` is empty.
- Bot messages and webhooks are ignored, and the bridge tags its own writes
  (`via: "bridge"`) and relayed ones (`via: "discord"`), so the optional mirror
  cannot loop.
- The database currently allows anonymous writes (the web app relies on it), so
  no service account is needed. If you lock the rules down later, add Firebase
  Auth to the bridge.
- Discord chat is inserted into POPS as text; the panel escapes it before
  rendering, so messages cannot inject HTML.
- The token lives only in `bridge/.env` (git-ignored). If it leaks, reset it in
  the Developer Portal.
