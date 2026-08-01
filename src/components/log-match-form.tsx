"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, Delta, ErrorBanner } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

export interface GameOption {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number | null;
  supportsFfa: boolean;
  rankingMode: "full" | "winner_only" | "top_n";
}

export interface MemberOption {
  userId: string;
  displayName: string;
}

interface LoggedResult {
  participants: {
    userId: string;
    displayName: string;
    finalRank: number;
    ratingDelta: number | null;
  }[];
}

/**
 * The 15-second logging flow (spec §3).
 *
 * Ordering uses explicit move buttons rather than drag handles. Drag-and-drop
 * that works reliably on touch needs a dependency and a keyboard-accessible
 * fallback; ▲▼ is instantly usable, screen-reader friendly, and about as fast
 * for the 2-6 players a typical match has.
 */
export function LogMatchForm({
  slug,
  games,
  members,
  defaultGameId,
  defaultParticipantIds,
}: {
  slug: string;
  games: GameOption[];
  members: MemberOption[];
  defaultGameId: string | null;
  defaultParticipantIds: string[];
}) {
  const router = useRouter();

  const [gameId, setGameId] = useState(defaultGameId ?? games[0]?.id ?? "");
  // Aggressive defaulting: same game, same people as last time (spec §3).
  const [order, setOrder] = useState<string[]>(
    defaultParticipantIds.length > 0 ? defaultParticipantIds : members.slice(0, 2).map((m) => m.userId),
  );
  const [matchType, setMatchType] = useState<"competitive" | "casual">("competitive");
  const [showOptions, setShowOptions] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LoggedResult | null>(null);

  // Guests added during this session, appended to the roster locally so the
  // page does not need a full reload mid-flow.
  const [extraMembers, setExtraMembers] = useState<MemberOption[]>([]);
  const [guestName, setGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);

  const roster = useMemo(() => [...members, ...extraMembers], [members, extraMembers]);
  const game = games.find((g) => g.id === gameId) ?? null;
  const winnerOnly = game?.rankingMode === "winner_only";
  const byId = useMemo(() => new Map(roster.map((m) => [m.userId, m])), [roster]);

  async function addGuest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = guestName.trim();
    if (!displayName) return;

    setPending(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: { id: string; displayName: string } }>(
        `/api/groups/${slug}/guests`,
        { displayName },
      );
      const option = { userId: user.id, displayName: user.displayName };
      setExtraMembers((current) => [...current, option]);
      // A guest is added because they are playing right now, so select them.
      setOrder((current) => [...current, option.userId]);
      setGuestName("");
      setAddingGuest(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't add that guest.");
    } finally {
      setPending(false);
    }
  }

  function toggle(userId: string) {
    setOrder((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  function move(index: number, direction: -1 | 1) {
    setOrder((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const countError =
    game && order.length < game.minPlayers
      ? `${game.name} needs at least ${game.minPlayers} players.`
      : game?.maxPlayers && order.length > game.maxPlayers
        ? `${game.name} supports at most ${game.maxPlayers} players.`
        : null;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const payload = await api.post<LoggedResult>(`/api/groups/${slug}/matches`, {
        gameId,
        matchType,
        teamMode: "ffa",
        participants: order.map((userId, index) => ({ userId, rank: index + 1 })),
        // Lets a retry after a flaky connection not double-log (spec §10).
        idempotencyKey: crypto.randomUUID(),
      });
      setResult(payload);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't log that match.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <Card>
          <p className="mb-3 text-sm font-medium">Match logged</p>
          <ul className="space-y-2">
            {result.participants.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-muted tnum">{p.finalRank}</span>
                <span className="flex-1 truncate">{p.displayName}</span>
                <Delta value={p.ratingDelta} className="font-semibold" />
              </li>
            ))}
          </ul>
        </Card>
        <Button onClick={() => router.push(`/g/${slug}`)}>Back to standings</Button>
        <Button variant="secondary" onClick={() => setResult(null)}>
          Log another
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Game</h2>
        <div className="flex flex-wrap gap-2">
          {games.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGameId(g.id)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                g.id === gameId
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-text"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Who played?
        </h2>
        <div className="flex flex-wrap gap-2">
          {roster.map((m) => {
            const active = order.includes(m.userId);
            return (
              <button
                key={m.userId}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(m.userId)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted hover:text-text"
                }`}
              >
                {m.displayName}
              </button>
            );
          })}

          {addingGuest ? null : (
            <button
              type="button"
              onClick={() => setAddingGuest(true)}
              className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted hover:text-text"
            >
              + Guest
            </button>
          )}
        </div>

        {addingGuest ? (
          <form onSubmit={addGuest} className="mt-2 flex gap-2">
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Guest name"
              autoFocus
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <Button type="submit" variant="secondary" className="w-auto px-4" disabled={pending}>
              Add
            </Button>
          </form>
        ) : null}
      </section>

      {order.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {winnerOnly ? "Who won?" : "Finishing order"}
          </h2>

          {winnerOnly ? (
            <Card className="p-0">
              <ul>
                {order.map((userId) => (
                  <li key={userId} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() =>
                        setOrder([userId, ...order.filter((id) => id !== userId)])
                      }
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
                    >
                      <span
                        className={`grid size-5 place-items-center rounded-full border ${
                          order[0] === userId ? "border-accent bg-accent" : "border-muted"
                        }`}
                      />
                      <span className="flex-1 truncate">{byId.get(userId)?.displayName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card className="p-0">
              <ul>
                {order.map((userId, index) => (
                  <li
                    key={userId}
                    className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-0"
                  >
                    <span className="w-5 text-sm text-muted tnum">{index + 1}</span>
                    <span className="flex-1 truncate text-sm">{byId.get(userId)?.displayName}</span>
                    <button
                      type="button"
                      aria-label={`Move ${byId.get(userId)?.displayName} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="grid size-8 place-items-center rounded-lg border border-border text-muted disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${byId.get(userId)?.displayName} down`}
                      disabled={index === order.length - 1}
                      onClick={() => move(index, 1)}
                      className="grid size-8 place-items-center rounded-lg border border-border text-muted disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      ) : null}

      <section>
        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          className="text-sm text-muted hover:text-text"
        >
          {showOptions ? "▲" : "▼"} More options
        </button>
        {showOptions ? (
          <div className="mt-3 flex gap-2">
            {(["competitive", "casual"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setMatchType(type)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm capitalize transition ${
                  matchType === type
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        ) : null}
        {matchType === "casual" ? (
          <p className="mt-2 text-xs text-muted">Casual games don&apos;t affect ratings.</p>
        ) : null}
      </section>

      <ErrorBanner>{error ?? countError}</ErrorBanner>

      <Button onClick={submit} disabled={pending || !!countError || !gameId}>
        {pending ? "Logging…" : "Log match"}
      </Button>
    </div>
  );
}
