/**
 * End-to-end smoke test against a running server and the real database.
 *
 * Exercises the whole Phase 1 loop over HTTP the way a browser would,
 * including cookie-based sessions:
 *   register -> create group -> invite -> join -> add guest -> log match
 *   -> leaderboard -> profile -> idempotent replay
 *
 *   npm run build && npm start        (in one terminal)
 *   npx tsx scripts/smoke.ts          (in another)
 */

export {};

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

/** Minimal cookie jar, since fetch does not persist Set-Cookie. */
class Session {
  private cookies = new Map<string, string>();

  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(this.cookies.size > 0
          ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });

    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload as T;
  }

  get = <T,>(p: string) => this.call<T>("GET", p);
  post = <T,>(p: string, b?: unknown) => this.call<T>("POST", p, b);
}

let passed = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    console.error(`  FAIL  ${label}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log(`  ok    ${label}`);
}

const stamp = Date.now();
const email = (who: string) => `smoke-${who}-${stamp}@example.com`;

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  // --- Catalog -------------------------------------------------------------
  const anon = new Session();
  const { games } = await anon.get<{ games: { id: string; name: string; slug: string }[] }>(
    "/api/games",
  );
  check("game catalog is seeded with 8 games", games.length === 8, games.length);
  const chess = games.find((g) => g.slug === "chess")!;
  const monopolyDeal = games.find((g) => g.slug === "monopoly-deal")!;
  check("chess is present", !!chess);

  // --- Auth ----------------------------------------------------------------
  const alice = new Session();
  const registered = await alice.post<{ user: { id: string; displayName: string } }>(
    "/api/auth/register",
    { displayName: "Alice Smoke", email: email("alice"), password: "a good test password" },
  );
  check("register returns a user", !!registered.user.id);

  let rejected = false;
  try {
    await new Session().post("/api/groups", { name: "Should Fail" });
  } catch {
    rejected = true;
  }
  check("unauthenticated group creation is rejected", rejected);

  // --- Groups --------------------------------------------------------------
  const { group } = await alice.post<{ group: { id: string; slug: string; inviteCode: string } }>(
    "/api/groups",
    { name: `Smoke Group ${stamp}`, isPublic: false, timezone: "UTC" },
  );
  check("group created with a slug", !!group.slug);
  check("group has an invite code", /^[BCDFGHJKMNPQRSTVWXYZ23456789]{8}$/.test(group.inviteCode));

  const bob = new Session();
  await bob.post("/api/auth/register", {
    displayName: "Bob Smoke",
    email: email("bob"),
    password: "a good test password",
  });
  const joined = await bob.post<{ role: string }>("/api/groups/join", {
    inviteCode: group.inviteCode,
  });
  check("second user joins via invite code", joined.role === "member", joined);

  // --- Guests --------------------------------------------------------------
  const { user: guest } = await alice.post<{ user: { id: string; displayName: string } }>(
    `/api/groups/${group.slug}/guests`,
    { displayName: "Charlie Guest" },
  );
  check("guest created and added to the group", !!guest.id);

  // --- Logging a match -----------------------------------------------------
  const idempotencyKey = crypto.randomUUID();
  const logged = await alice.post<{
    match: { id: string; status: string; ratingsApplied: boolean };
    participants: { userId: string; finalRank: number; ratingBefore: number; ratingDelta: number }[];
  }>(`/api/groups/${group.slug}/matches`, {
    gameId: chess.id,
    matchType: "competitive",
    teamMode: "ffa",
    participants: [
      { userId: registered.user.id, rank: 1 },
      { userId: guest.id, rank: 2 },
    ],
    idempotencyKey,
  });

  check("match is confirmed immediately", logged.match.status === "confirmed");
  check("ratings were applied", logged.match.ratingsApplied === true);

  const winner = logged.participants.find((p) => p.finalRank === 1)!;
  const loser = logged.participants.find((p) => p.finalRank === 2)!;
  check("new players start at exactly 1000", Math.round(winner.ratingBefore) === 1000, winner.ratingBefore);
  check("winner gains rating", winner.ratingDelta > 0, winner.ratingDelta);
  check("loser loses rating", loser.ratingDelta < 0, loser.ratingDelta);

  // --- Idempotency ---------------------------------------------------------
  const replay = await alice.post<{ match: { id: string } }>(
    `/api/groups/${group.slug}/matches`,
    {
      gameId: chess.id,
      matchType: "competitive",
      teamMode: "ffa",
      participants: [
        { userId: registered.user.id, rank: 1 },
        { userId: guest.id, rank: 2 },
      ],
      idempotencyKey,
    },
  );
  check("replaying an idempotency key returns the same match", replay.match.id === logged.match.id);

  // --- Winner-only game ----------------------------------------------------
  const winnerOnly = await alice.post<{
    participants: { userId: string; finalRank: number }[];
  }>(`/api/groups/${group.slug}/matches`, {
    gameId: monopolyDeal.id,
    matchType: "competitive",
    teamMode: "ffa",
    participants: [
      { userId: registered.user.id, rank: 3 },
      { userId: guest.id, rank: 1 },
      { userId: (await bobId(bob)) as string, rank: 2 },
    ],
    idempotencyKey: crypto.randomUUID(),
  });
  const firsts = winnerOnly.participants.filter((p) => p.finalRank === 1);
  const seconds = winnerOnly.participants.filter((p) => p.finalRank === 2);
  check("winner_only collapses to one winner", firsts.length === 1, firsts);
  check("winner_only ties the rest at 2", seconds.length === 2, seconds);

  // --- Reads ---------------------------------------------------------------
  const detail = await alice.get<{
    leaderboard: { userId: string; rank: number; displayRating: number }[];
    games: { slug: string }[];
  }>(`/api/groups/${group.slug}?gameId=${chess.id}`);
  check("leaderboard has both chess players", detail.leaderboard.length === 2, detail.leaderboard);
  check("leaderboard is ordered by rating", detail.leaderboard[0].rank === 1);
  check(
    "winner is top of the chess board",
    detail.leaderboard[0].userId === registered.user.id,
    detail.leaderboard,
  );

  const history = await alice.get<{ matches: unknown[] }>(
    `/api/groups/${group.slug}/matches?limit=10`,
  );
  check("history returns both matches", history.matches.length === 2, history.matches.length);

  const profile = await alice.get<{
    games: { gameName: string; rank: number; outOf: number }[];
    recentMatches: unknown[];
  }>(`/api/users/${registered.user.id}/profile?group=${group.slug}`);
  check("profile lists both games", profile.games.length === 2, profile.games);
  check("profile lists recent matches", profile.recentMatches.length === 2);

  // --- Authorisation -------------------------------------------------------
  const carol = new Session();
  await carol.post("/api/auth/register", {
    displayName: "Carol Outsider",
    email: email("carol"),
    password: "a good test password",
  });
  let hidden = false;
  try {
    await carol.get(`/api/groups/${group.slug}`);
  } catch (err) {
    hidden = String(err).includes("404");
  }
  check("a private group 404s for non-members", hidden);

  console.log(`\n${passed} checks passed${process.exitCode ? " (with failures above)" : ""}`);
}

/** Bob's user id, via his own profile-bearing group listing. */
async function bobId(bob: Session): Promise<string> {
  const { groups } = await bob.get<{ groups: { group: { slug: string } }[] }>("/api/groups");
  const slug = groups[0].group.slug;
  const detail = await bob.get<{ members: { userId: string; displayName: string }[] }>(
    `/api/groups/${slug}`,
  );
  return detail.members.find((m) => m.displayName === "Bob Smoke")!.userId;
}

main().catch((err) => {
  console.error("\nSmoke test aborted:", err.message);
  process.exit(1);
});
