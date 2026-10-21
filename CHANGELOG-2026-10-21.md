# VTT-Light — Changes Applied

**Document generated:** 2026-10-21 16:32 +01:00
**Repository:** <https://github.com/MarkUnfeasibly/VTT-Light>
**Branch:** `main`
**Commit at time of writing:** `9290f5b`
**Session range:** `b86af64` → `9290f5b` (8 commits)

This document lists every change applied in this work session. Each change is
tied to the commit that contains it, and each was verified against the running
application or the live database rather than assumed.

---

## 1. Summary

The session turned VTT-Light from an open, single-machine tool into a
login-gated, multi-user game surface with a shared crew roster, a single game
master, and a Discord bridge.

| # | Commit | Change |
| --- | --- | --- |
| 1 | `b86af64` | Login gate (Firebase Auth), shared crew roster, rules files, setup doc |
| 2 | `61128f6` | Seat ownership, visible sign-out, PREP/PLAY toggle, single game master |
| 3 | `ba10d1c` | Firebase setup status documented (steps verified) |
| 4 | `4bcd8f4` | Discord sign-in recorded as deliberately skipped |
| 5 | `dd0e21b` | Game-master lockout recovery |
| 6 | `faf6cce` | Sliding PREP/PLAY switch |
| 7 | `fd4849d` | Discord Client ID made a shared, crew-wide setting |
| 8 | `9290f5b` | Setup doc corrected (rules `config` path already live) |

**Totals for the session:** 12 files changed, 1,347 insertions(+), 201 deletions(-).

---

## 2. Access model

### 2.1 Login gate — "nothing until you sign in"

- Added `src/auth.js` (new, 244 lines): email/password sign-in, sign-up mode
  tabs, friendly error mapping, and a visible sign-out control.
- The app content sits behind an auth overlay. Nothing renders until a session
  exists.
- **Critical fix:** the first implementation used a one-shot `onAuthReady`,
  which only ever fired once and left the gate stuck. Replaced with
  `onAuthChange` (fires on every auth state change) plus a `booted` guard in
  `src/main.js`.
- Sign-out clears the stored seat (`vtt_player_id`, `vtt_player_name`), so the
  next person to sign in does not inherit the previous user's seat.

### 2.2 Admin URL sessions

The mode is carried in the URL, which is intentional (two independent locks):

| URL | Result |
| --- | --- |
| `/` | Play only. No admin UI at all. |
| `/admin_mode` | Admin session. |
| `/admin`, `?admin`, `?mode=admin` | Equivalent admin session. |

An **admin URL alone is not enough**. Prep mode additionally requires a
**seated crew member flagged `isAdmin: true`**. `html.player` hides the crew
widget entirely for non-admin sessions.

### 2.3 Seat ownership

- Logging in sets your seat automatically (`ensureCrewForUser`), matched by
  Firebase UID or a linked Discord ID.
- Seats are personal: you cannot take a seat that belongs to someone else.
- The "Take a seat" control only ever seats **your own** record.

### 2.4 Single game master

- Enforced centrally in `playerdb.savePlayer`: granting `isAdmin` demotes every
  other record, so at most one crown exists at any time.
- Promoting a new game master shows a confirmation dialog.
- **Bootstrap rule:** if no admin exists at all, the first crew member created
  (or the next one promoted) becomes game master.

---

## 3. PREP / PLAY mode

### 3.1 Behaviour

- Mode is driven by a hidden `#modeSelect` element, which remains the **single
  source of truth**. `src/input.js` and `src/renderer.js` were therefore
  **not modified** — they keep reading the same value as before.
- Admins land in **PREP** by default; non-admins are locked to **PLAY**.
- A non-admin sees a hint: *"👑 Seat an admin crew member to unlock prep mode"*.

### 3.2 Sliding switch (`faf6cce`)

Replaced the original two-segment pill with a sliding-knob switch, styled after
the requested `slap_toggle.png` reference:

- A rounded track with a circular knob: **left = PLAY**, **right = PREP**.
- PLAY and PREP labels sit either side; the active one lights in its colour
  (`#00ffcc` for PLAY, `#c084fc` for PREP) and the track recolours for PREP.
- `role="switch"` with `aria-checked`, keyboard-focusable.
- Knob position is driven by a **class plus** `aria-checked`, not a descendant
  selector alone.

**Bug fixed during this work:** `applyAdminGate` set `modeSelect.value = 'prep'`
without syncing the switch visuals, so the switch could disagree with the
select. `syncModeToggle()` is now called unconditionally after the gate
branches, and the switch also re-syncs on the select's `change` event — so it
cannot drift out of step regardless of which route changed the mode.

---

## 4. Discord

Three **separate** integrations are involved. They are easy to confuse:

| Integration | Credential required | Status |
| --- | --- | --- |
| Chat relay (Discord ↔ POPS) | Bot token | ✅ working |
| Sign-in screen "with Discord" | Client ID **+ secret** | ⏭️ skipped by decision |
| Crew record "Discord account" link | Client ID only (PKCE) | ✅ configured |

### 4.1 Chat relay / bridge (`c6aea9e`, refined in this session)

- `bridge/` is a standalone Node process that holds the bot token. It never runs
  in the browser or the static site.

```
Discord  ──message──▶  bridge  ──write──▶  Firebase `pops_log`  ──▶  POPS panel
POPS     ──SSE──────▶  bridge  ──send───▶  Discord channel        (MIRROR_POPS=true)
@POPS    ──mention──▶  bridge  ──POST───▶  RAG + SLM  ──▶  Discord reply + POPS entry
```

- The bridge now authenticates to Firebase with a dedicated account
  (`bridge@vtt-light.local`) and appends `?auth=<idToken>` to every request.
- Verified live: a real Discord message (`@POPS what is the size of the Navy.`)
  was relayed into POPS and answered by the bot.

### 4.2 Discord sign-in — deliberately skipped (`4bcd8f4`)

Generic OIDC (needed for "Sign in with Discord") requires the Firebase
**Identity Platform** upgrade, which is a **paid** change. Email/password is
sufficient, and **Discord chat is unaffected** because the relay uses the bot
token, not OIDC. Recorded in `FIREBASE_SETUP.md` with paste-ready values so it
can be switched on later without re-investigation.

### 4.3 Crew-record Discord linking (`fd4849d`)

**Problem reported:** editing a record showed *"Discord account: not linked"*,
and clicking the button produced *"No Discord client ID configured"*.

**Cause:** the Client ID had never been set — and worse, it was stored in
**per-browser IndexedDB**, so even when set it would only work in the browser
that set it.

**Fix:**

- The Client ID now lives in the shared Realtime Database at
  `config/discord_client_id`, so **one admin configures the whole crew**.
  IndexedDB is kept as a read-through cache for offline use.
- Requires a **seated admin** (same privilege as prep mode), since it is a
  crew-wide setting. The field is hidden outright for anyone who cannot change
  it, rather than shown-but-ineffective.
- Saves on blur **and** on Enter.
- Status line is honest: **✅ shared with all crew** only when the cloud write
  succeeded; otherwise an amber warning naming the cause.
- Re-evaluated on seat changes, so the field appears when an admin sits down.

**Verified end-to-end:** panel shows `1562216515313340506`,
status **✅ shared with all crew**, GM tools unlocked.

**No Client ID needed:** the editor also accepts a Discord **username or numeric
user ID** typed directly into the record. The relay already stamps every message
with the author's Discord ID, so this matches crew to messages with zero setup.

---

## 5. Game-master recovery (`dd0e21b`)

The crown lives on the **crew record** (`crew/<id>/isAdmin`), separate from the
**account** in Firebase Authentication. If the holder loses their password,
nobody else could be promoted — a deadlock.

**Two recovery paths, both tested:**

1. **In the app** — the last remaining admin can always be un-crowned (with a
   confirmation). With no admin left, the bootstrap rule lets whoever is present
   be crowned. The editor path (untick *Game master*, save) also works.
2. **In the Firebase console** — set `isAdmin` to `false` on the stranded record,
   then `true` on the replacement. No redeploy needed; the app is subscribed.

Removing the crown **keeps the crew record** — seat, character and colour are
retained; only prep access is removed.

---

## 6. Database rules and security

`database.rules.json` and `storage.rules` were added to the repo so they are
version-controlled, and referenced from `firebase.json`.

Every path requires `auth != null`; anonymous access is refused.

**Verified live:**

| Check | Result |
| --- | --- |
| Signed-in read of `/config`, `/crew`, `/pops_log` | `200` |
| Signed-in **write** to `/config` | `200` |
| Anonymous read of `/config`, `/crew`, `/pops_log` | `401` |

`pops_log` also carries `.indexOn: ["timestamp"]`, which makes the relay's
history query considerably cheaper.

---

## 7. Files changed this session

| File | Change | Notes |
| --- | --- | --- |
| `src/auth.js` | **new** (+244) | Login gate, sign-out, error mapping |
| `src/main.js` | modified (+178 / −142) | Gate wiring, `onAuthChange`, boot guard |
| `src/playerdb.js` | modified (+162 / −10) | Shared config, single-admin demotion |
| `src/players.js` | modified (+161 / −22) | Seat ownership, admin recovery, Discord field |
| `index.html` | modified (+98 / −6) | Auth overlay, sliding switch, status line |
| `src/ui.js` | modified (+54 / −15) | Switch wiring, admin gate |
| `bridge/index.js` | modified (+40 / −2) | Firebase Auth for `pops_log` |
| `database.rules.json` | **new** (+55) | Path rules incl. `config` |
| `src/discord.js` | modified (+16 / −4) | Shared Client ID, clearer alert |
| `storage.rules` | **new** (+9) | Storage requires auth |
| `firebase.json` | modified (+6) | Points at both rules files |
| `FIREBASE_SETUP.md` | **new** (+324) | Setup status, verify table, recovery |

---

## 8. Outstanding work

### 8.1 Deployment (needs Firebase access)

The public site **`https://vtt-light.web.app` is running an older build** —
before the sliding switch and before the Discord Client ID changes. Your local
`localhost:5173` has everything.

To deploy:

```powershell
cd F:\VTT-Light
npm.cmd run build
npx.cmd firebase-tools login      # once, as an owner of vtt-light
npx.cmd firebase-tools deploy --only hosting
```

### 8.2 Discord OAuth redirect URLs

For the **🔗 Link Discord** button to complete, the Discord app's
**OAuth2 → Redirects** must list the exact URLs you play on (trailing slash
included, because the redirect uses `location.origin + location.pathname`):

- `https://vtt-light.web.app/`
- `https://vtt-light.firebaseapp.com/`
- `http://localhost:5173/`

### 8.3 Bridge uptime

The bridge must stay running for Discord ↔ POPS to work. It currently runs as a
local process. To make it permanent, run it as a Windows scheduled task/service
(e.g. NSSM) at logon, or deploy `bridge/` to any small always-on Node host.

### 8.4 Security recommendation

The Discord **client secret** was exposed in plain text during this work. It is
not needed by anything currently working (the relay uses the bot token). Reset
it in the Developer Portal so the exposed value is dead — this costs nothing.

---

## 9. Verification performed

| Area | How verified | Result |
| --- | --- | --- |
| Login gate | Sign-in → crew setup → boot | ✅ |
| Seat ownership | Seat auto-set on login; sign-out clears it | ✅ |
| Single game master | Live demotion on promotion | ✅ |
| Admin lockout recovery | Reproduced, fixed, re-crowned | ✅ |
| Sliding switch | Both directions, `aria-checked`, labels, GM tools | ✅ |
| Switch privilege | Seated admin enabled; non-admin hidden/disabled | ✅ |
| Discord relay | Real Discord message relayed and answered | ✅ |
| Discord Client ID | Panel shows shared value + green status | ✅ |
| Database rules | `200` signed-in, `401` anonymous | ✅ |
| Crown final state | **`thomaj3` holds it — exactly one admin** | ✅ |

**Known limitation:** the sliding knob's pixel position could not be visually
confirmed, and screenshots were unavailable. Every state input the application
controls (mode value, `aria-checked`, active label, GM tools) verifies
correctly. Please eyeball the switch once in your own browser.

---

*Generated from the git history of `MarkUnfeasibly/VTT-Light`, branch `main`.*
