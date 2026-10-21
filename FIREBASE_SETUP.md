# Firebase setup — status and remaining work

**Project:** `vtt-light` — https://console.firebase.google.com/project/vtt-light

VTT-Light has a **login gate** (nobody sees the map until they sign in) and a
**shared crew roster** stored in the Firebase Realtime Database (`crew/<id>`).
The database is now **locked down**: every path requires an authenticated
session, and unauthenticated reads/writes are rejected with `401`.

## Status

| # | Step | State |
| --- | --- | --- |
| 1 | [Give Jason project access](#1-give-jason-project-access) | ✅ done |
| 2 | [Enable Email/Password sign-in](#2-enable-emailpassword-sign-in) | ✅ done |
| 3 | [Authorised domains](#3-authorised-domains) | ✅ done |
| 4 | [Enable the Discord sign-in (optional)](#4-enable-the-discord-sign-in-optional) | ⬜ **outstanding — needs Mark** |
| 5 | [Create the bridge service account](#5-create-the-bridge-service-account) | ✅ done |
| 6 | [Publish the new rules](#6-publish-the-new-rules) | ✅ done |
| 7 | [Verify](#7-verify) | ✅ done |
| 8 | [Troubleshooting](#troubleshooting) | reference |
| 9 | [Rollback](#rollback) | reference |

**Only step 4 remains**, and it is optional: it needs the Discord *Client
Secret* from the POPS Relay app, which only Mark can read. Until then the
*Continue with Discord* button shows a "not switched on in Firebase yet"
notice and everyone signs in with email/password, which works.

Completed on 2026-10-21, verified at the time of writing:

- unauthenticated `GET`/`POST` to `/`, `/crew`, `/pops_log` → `401`
- the bridge account reads and writes `pops_log` → `200`
- the app boots signed in (crew roster loads, seat restored, no console errors)
- the bridge reconnects as `POPS#9637` and signs in with its own account

---

## 1. Give Jason project access

**Status: ✅ done** (Jason has console access and completed steps 2, 3, 5 and 6).

Jason signs in with **thomaj3@gmail.com**. If that Google account cannot see
the project, the console will only say *you don't have access*.

> **Project settings → Users and permissions → Add member** →
> `thomaj3@gmail.com` → role **Editor** (Owner if he should be able to manage
> billing/rules without you).

## 2. Enable Email/Password sign-in

**Status: ✅ done.** Players without a Discord account use this, and it is the
fallback while step 4 is outstanding.

> **Authentication → Sign-in method → Email/Password → Enable → Save**

Self sign-up is on by default, so players can use *Need an account? Create
one* on the login screen. (If you'd rather approve every account, turn off
*Enable create (sign-up)* and add users yourself under **Users → Add user**.)

## 3. Authorised domains

**Status: ✅ done** — `localhost` and the Firebase-hosted domain are listed.

> **Authentication → Settings → Authorised domains**

Confirm these are listed (they normally are):

- `localhost` — for development on Jason's machine
- `vtt-light.firebaseapp.com` — the deployed app
- your hosting domain, if you added a custom one

## 4. Enable the Discord sign-in (optional)

**Status: ⬜ outstanding — only Mark can finish this.** The provider needs the
Discord *Client Secret*, which lives in the POPS Relay app under Mark's Discord
account. Everything else below is ready to paste.

Firebase has **no built-in Discord provider**, so Discord is added as a
generic OpenID Connect provider. Until this is done email/password still works
— only the *Continue with Discord* button is inactive (it shows a "not switched
on in Firebase yet" notice).

> **Authentication → Sign-in method → Add provider → OpenID Connect**

| Field | Value |
| --- | --- |
| Provider ID | `discord.com` |
| Client ID | `1562216515313340506` (the *POPS Relay* Discord app) |
| Client secret | Discord Developer Portal → **POPS Relay** → OAuth2 → **Client Secret** (Mark has this) |
| Issuer URL | `https://discord.com` |

Then tell Discord where the callback goes:

> Discord Developer Portal → **POPS Relay** → OAuth2 → **Redirects → Add**:

- `https://vtt-light.firebaseapp.com/__/auth/handler`
- `http://localhost:5173/__/auth/handler`

**Custom claims (leave empty).** Save, then test the button. If Firebase
rejects the OIDC discovery document, email/password still works and we can
retry with a differently-shaped provider — say so and we'll debug together.

## 5. Create the bridge service account

**Status: ✅ done.** Account `bridge@vtt-light.local` exists, its credentials
are in `bridge/.env`, and the bridge signs in and writes `pops_log` with a
token (verified: `200` on authenticated read/write).

The Discord bridge (`bridge/`) writes POPS entries to `pops_log` as an
external Node service. Once the rules require auth (step 6) it needs its own
Firebase account — otherwise Discord chat stops reaching the app.

> **Authentication → Users → Add user**

- Email: e.g. `bridge@vtt-light.local` (any address works; it never gets mail)
- Password: generate something long — **do not reuse the Discord bot token**

Then add it to `bridge/.env` (git-ignored, local only):

```
FIREBASE_EMAIL=bridge@vtt-light.local
FIREBASE_PASSWORD="<the password you just set>"
```

**Quote the password.** If it contains a `#`, an unquoted value would be
silently truncated at the `#` by the dotenv parser and sign-in would fail with
a confusing "invalid password" error.

Restart the bridge (`npm.cmd start` in `bridge/`). With no credentials the
bridge runs exactly as before; with credentials it signs in and appends its
token to every write and to the POPS stream (refreshing it hourly).

## 6. Publish the new rules

**Status: ✅ done.** Verified live: unauthenticated `GET`/`POST` to `/`,
`/crew` and `/pops_log` return `401`; the app and the bridge still work.

The rules now live **in this repo** so they are version-controlled:

- `database.rules.json` — every path requires `auth != null`
  (plus `.indexOn: ["timestamp"]` on `pops_log`, which also makes the Discord
  relay's history query a lot cheaper)
- `storage.rules` — map/PDF uploads require `auth != null`
- `firebase.json` — points at both files

**Option A — deploy from a terminal (keeps repo as source of truth):**

```sh
npm i -g firebase-tools   # once
firebase login            # with the account that owns vtt-light
cd VTT-Light
npx firebase-tools deploy --only database,storage
```

**Option B — paste in the console:**

> Realtime Database → **Rules** tab → replace everything with the contents of
> `database.rules.json` → **Publish**.
> Then Storage → Rules → paste `storage.rules` → **Publish**.

⚠️ **Do step 5 before step 6**, and only do step 6 while signed into the app in
a browser tab — the moment the rules go live, every *unauthenticated* client
(including the bridge until configured, and any browser tab open without a
session) loses read/write access.

## 7. Verify

**Status: ✅ done** (2026-10-21).

Checks run against the live project:

| Check | Expected | Result |
| --- | --- | --- |
| Signed-out app | Login screen only, nothing boots behind it | ✅ |
| Sign in with email/password | VTT loads, crew roster reads | ✅ |
| Sign out (⏻ chip, top-right) | Back to the login screen, seat cleared | ✅ |
| Unauthenticated `GET`/`POST` `/`, `/crew`, `/pops_log` | Denied | ✅ all `401` |
| Authenticated (bridge account) read/write `pops_log` | Allowed | ✅ `200`, history intact |
| Bridge restart | Connects as `POPS#9637`, signs in with its account | ✅ |

Still to confirm by hand (needs a live Discord message):

4. Create a crew record with **Discord user ID `446329123204497408`** on
   Jason's crew row → Discord messages from his account show his crew name in
   POPS.
5. Send `hello` in `#general` → it appears in POPS (bridge authenticated).
6. Ask `@POPS <question>` in Discord → AI answer lands back in Discord and POPS.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| *"auth/operation-not-allowed"* | Email/Password provider not enabled (step 2). |
| *"auth/unauthorized-domain"* | Domain missing from Authorised domains (step 3). |
| *"auth/popup-blocked"* | Browser blocked the Discord popup — allow popups. |
| *"auth/configuration-not-found"* / OIDC errors | Discord provider missing or wrong ID/secret/issuer (step 4). |
| Blank app + `401 Unauthorized` in console | Rules were published before a session existed — sign in, or check the session (↻ reload). |
| Discord chat no longer reaches POPS | Bridge account wrong/expired — check `FIREBASE_EMAIL`/`FIREBASE_PASSWORD` in `bridge/.env` and restart the bridge. |
| Bridge says "invalid password" but the password is correct | Password contains `#` — quote it in `.env` (`FIREBASE_PASSWORD="p#ss"`), or dotenv treats the rest as a comment. |
| Crew roster empty for a new player | Their first sign-in creates the record; if not, check `crew` in the database console. |
| Cannot deploy rules | `firebase login` with the *owner* of `vtt-light`, or ask Mark for Owner/Editor under **Users and permissions**. |

## Rollback

Undo the lock-down (step 6):

> Realtime Database → **Rules** → set both `read` and `write` back to
> `true` at the top level → **Publish**, and disable providers if needed. The
> app itself requires no changes to go back.

The bridge keeps its credentials in `bridge/.env`; they are harmless when the
rules are open, so no bridge change is needed either way.
