# Board Game ELO Tracker — Full System Overview

## What it is
A web app for tracking board game ratings among friend groups. Players log match results, an OpenSkill rating engine updates per-game/per-group ELO-like scores instantly, and the app shows leaderboards, profiles, badges, weekly recaps, and social features.

**Live at:** https://elo-tracker-inky.vercel.app  
**Stack:** Next.js 16 (App Router), TypeScript, PostgreSQL (Neon), Tailwind CSS 4, Drizzle ORM  
**Deployed on:** Vercel (serverless) + Neon (managed Postgres)

---

## Architecture

### Database (14 tables, PostgreSQL)
- **users** — email/password auth (scrypt hashed), guests (no email), soft delete
- **groups** — the core social unit; slug, invite code, public toggle
- **group_members** — role-based: owner / admin / member / spectator
- **games** — catalog seeded with 8 games (Sequence, Chess, Catan, etc.); users can add custom games
- **matches** — every logged game result; FFA or teams, competitive or casual, status lifecycle
- **match_teams** — ad-hoc teams per match (for team-mode games like Codenames)
- **match_participants** — per-player result: final rank, rating before/after/delta, departure status
- **current_ratings** — materialized per-user-per-game-per-group rating (mu, sigma, display_rating, W/L count)
- **rating_snapshots** — immutable audit trail of every OpenSkill change
- **seasons** — time-boxed ranking resets (schema exists, UI minimal)
- **teams / team_members / team_ratings** — persistent teams (schema exists, v2 feature)
- **password_reset_tokens** — one-time tokens expiring in 1 hour

### Rating Engine
- **Library:** OpenSkill (JavaScript), Plackett-Luce model
- **Display formula:** 1000 + ordinal × 40, where ordinal = mu − 3×sigma (z=3)
- **Default params:** mu=25, sigma=8.33, beta=4.17, tau=0.083
- **New player starts at exactly 1000**; typical spread after games: ~900–1150
- **Match modes:** FFA (each player ranked), teams (players grouped into sides), winner-only (Monopoly Deal)
- **Ties:** competition ranking (1, 1, 3, 4) — tied players get identical rating changes
- **Casual mode:** stats tracked in a separate pool, no rating impact

### Auth
- Stateless JWT cookies (HS256, 30-day expiry) with `httpOnly` + `sameSite=lax`
- Registration, login, guest creation, guest-to-account claiming
- Rate limiting: login 15/15min, register 5/hour (in-memory, per IP)
- Email verification via Resend (optional — silently skipped if no API key)
- Password reset flow with tokenized links

### API Routes (REST, 20+ endpoints)
```
POST /api/auth/register, /login, /logout, /guest, /claim-guest
GET /api/auth/verify, POST+PATCH /api/auth/reset-password
GET+POST /api/games
GET+POST /api/groups, GET+PATCH+DELETE /api/groups/[slug]
POST /api/groups/join, /api/groups/[slug]/invite
POST /api/groups/[slug]/guests
GET+POST /api/groups/[slug]/matches
GET /api/groups/[slug]/roundup, /stats
GET+POST /api/groups/[slug]/teams
GET+POST /api/groups/[slug]/seasons
DELETE /api/matches/[id] (undo/void)
PATCH /api/matches/[id]/participants/[userId] (rage-quit)
GET /api/users/[id]/profile
GET /api/me/activity, /api/me/export
```

---

## Features (built and deployed)

### Core loop
| Feature | Details |
|---|---|
| Match logging | 15-second flow: pick game, pick players, order finish, confirm. Ratings apply instantly |
| Undo / void | 60-second undo for participants; admin void at any time |
| Team matches | 2v2, 2v2v2; random teams button; bucket-based player assignment |
| Guest players | +Guest button creates named guest, adds to group, tracks their ratings |
| Idempotency | UUID keys prevent double-submission from retries |
| Offline queue | Failed submissions saved to localStorage; retry banner on dashboard |
| Rage-quit | Mark players as left_early or left_excused (PATCH endpoint, UI minimal) |

### Social & retention
| Feature | Details |
|---|---|
| Leaderboard | Per-game rankings with tier badges (Bronze→Master), ▲▼ arrows, sparkline mini-graphs |
| Profile page | Hero rating number, per-game breakdown with win-rate bars, head-to-head nemesis/prey |
| Badges | First Win, Streak:5/10, Giant Slayer, Iron Man, Century, Perfect Week — computed on read, toast on unlock |
| Weekly roundup | Auto-generated: most wins, biggest gain, biggest upset, quiet members |
| Streak counter | Consecutive days with matches; 3+ day streak banner |
| Activity feed | Recent matches formatted as narrative headlines |
| Group stats | Total matches, players, most-played game, first match date |
| Confetti | Canvas particle burst when you log a win |
| Animated tickers | Ratings animate up/down like a scoreboard |
| Floating deltas | +18/-12 badges pop up and fade on rating change |
| Leader crown | 👑 + golden glow on #1 player |

### Customization
| Feature | Details |
|---|---|
| Color themes | 5 accent colors (blue, green, purple, amber, rose) — bottom bar picker, localStorage |
| Custom games | Any user can add games to the global catalog |
| Group settings | Rename, timezone, public/private toggle, invite code regeneration, delete |
| Privacy | "Hide my rating" toggle (localStorage) |
| Data export | GDPR-friendly JSON dump at /api/me/export |

### Public launch
| Feature | Details |
|---|---|
| Landing page | Hero + features grid + inline auth form |
| Public discovery | /discover lists groups with isPublic=true |
| Terms / Privacy | Static pages at /terms and /privacy |
| Custom 404 | Branded error page |
| SEO | Metadata, OpenGraph, keywords |
| Vercel Analytics | Anonymous page views |
| Email | Resend integration for verification + password reset |
| Security | CSP headers, rate limiting, scrypt passwords |

### Admin
| Feature | Details |
|---|---|
| Dashboard | /admin — signups/day, matches/day, top games, top groups, active users; no auth gate |

---

## What's NOT built (deferred or deprioritized)

- **Push notifications** — needs Web Push API + service worker + VAPID keys
- **Confirmations/disputes** — ratings apply immediately by design; disputes via void
- **Persistent team ratings** — schema exists, not wired
- **Season-scoped leaderboards** — schema exists, not wired
- **Photo attachments** — needs file storage
- **Global cross-group leaderboard** — needs opt-in infrastructure
- **Audio feedback** — trivial to add (Web Audio API)
- **Emoji reactions on matches** — needs reactions table
- **Active/online presence** — needs WebSockets
- **"Comeback Kid" badge** — needs raw_score tracking
- **Monetization** — free forever, no payment integration
- **OAuth (Google/Apple login)** — not implemented

---

## How data flows

1. **Register/login** → JWT cookie set → all subsequent requests carry session
2. **Create group** → slug generated, invite code generated, creator added as owner
3. **Join via invite** → user becomes member of group
4. **Log match** → participants validated as members → ranks resolved → OpenSkill rate() called → match + participants + snapshots inserted → current_ratings upserted → status = confirmed → response returned
5. **Undo** → checks participant permission or admin role → verifies no newer matches exist → reverses ratings from snapshot → inserts reversal rows → marks match voided
6. **View profile** → queries current_ratings with window functions for rank → self-joins match_participants for head-to-head → computes badges on read
7. **Weekly roundup** → queries matches from last 7 days → aggregates wins, gains, upsets, quiet members
