/** Renders the authenticated pages and asserts real data reaches the HTML. */
export {};

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();

const cookies = new Map<string, string>();
function header(): Record<string, string> {
  return cookies.size ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {};
}
async function call(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { ...header() };
  if (body) headers["content-type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    cookies.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return res;
}

let ok = 0;
function check(label: string, pass: boolean, detail?: unknown) {
  if (pass) {
    ok += 1;
    console.log(`  ok    ${label}`);
  } else {
    console.error(`  FAIL  ${label}`, detail ?? "");
    process.exitCode = 1;
  }
}

async function main() {
  const reg = await call("POST", "/api/auth/register", {
    displayName: "Page Tester",
    email: `pages-${stamp}@example.com`,
    password: "a good test password",
  });
  const { user } = await reg.json();

  const gamesRes = await call("GET", "/api/games");
  const { games } = await gamesRes.json();
  const chess = games.find((g: { slug: string }) => g.slug === "chess");

  const groupRes = await call("POST", "/api/groups", {
    name: `Page Group ${stamp}`,
    isPublic: false,
    timezone: "UTC",
  });
  const { group } = await groupRes.json();

  const guestRes = await call("POST", `/api/groups/${group.slug}/guests`, {
    displayName: "Rival Rita",
  });
  const { user: guest } = await guestRes.json();

  await call("POST", `/api/groups/${group.slug}/matches`, {
    gameId: chess.id,
    matchType: "competitive",
    teamMode: "ffa",
    participants: [
      { userId: user.id, rank: 1 },
      { userId: guest.id, rank: 2 },
    ],
    idempotencyKey: crypto.randomUUID(),
  });

  const dashboard = await (await call("GET", `/g/${group.slug}`)).text();
  check("dashboard renders the group name", dashboard.includes(`Page Group ${stamp}`));
  check("dashboard shows the invite code", dashboard.includes(group.inviteCode));
  check("dashboard lists both players", dashboard.includes("Rival Rita") && dashboard.includes("Page Tester"));
  check("dashboard offers the log-a-game action", dashboard.includes("Log a game"));

  // Compare the rendered numbers against what the API reports, rather than
  // guessing at a range.
  const api = await (await call("GET", `/api/groups/${group.slug}?gameId=${chess.id}`)).json();
  const rendered = api.leaderboard.map((e: { displayRating: number }) => Math.round(e.displayRating));
  check(
    `dashboard renders the real ratings (${rendered.join(", ")})`,
    rendered.every((r: number) => dashboard.includes(String(r))),
    rendered,
  );
  check(
    "the winner is above and the loser below the 1000 baseline",
    rendered[0] > 1000 && rendered[1] < 1000,
    rendered,
  );

  const log = await (await call("GET", `/g/${group.slug}/log`)).text();
  check("log page renders the game catalog", log.includes("Chess") && log.includes("Catan"));
  check("log page pre-fills last line-up", log.includes("Rival Rita"));
  check("log page offers the guest button", log.includes("+ Guest"));

  const profile = await (await call("GET", `/g/${group.slug}/u/${user.id}`)).text();
  check("profile renders the player name", profile.includes("Page Tester"));
  check("profile shows the game breakdown", profile.includes("Chess"));
  check("profile shows a head-to-head or record", profile.includes("Recent matches"));

  const groupsList = await (await call("GET", "/groups")).text();
  check("groups list shows the new group", groupsList.includes(`Page Group ${stamp}`));

  const invite = await (await call("GET", `/join/${group.inviteCode}`)).status;
  check("invite link redirects a signed-in member straight in", invite === 307, invite);

  console.log(`\n${ok} page checks passed${process.exitCode ? " (with failures)" : ""}`);
}

main().catch((e) => {
  console.error("aborted:", e.message);
  process.exit(1);
});
