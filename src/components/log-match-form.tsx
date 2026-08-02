"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, Chip, Delta, ErrorBanner, Field } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";
import { queueMatch } from "@/lib/offline";
import { UndoButton } from "@/components/match-actions";
import { Confetti } from "@/components/confetti";

export interface GameOption {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number | null;
  supportsFfa: boolean;
  supportsTeams: boolean;
  rankingMode: "full" | "winner_only" | "top_n";
}

export interface MemberOption {
  userId: string;
  displayName: string;
}

interface LoggedResult {
  match: { id: string };
  participants: {
    userId: string;
    displayName: string;
    finalRank: number;
    ratingDelta: number | null;
  }[];
}

/**
 * The 15-second logging flow (spec Â§3).
 *
 * Ordering uses explicit move buttons rather than drag handles. Drag-and-drop
 * that works reliably on touch needs a dependency and a keyboard-accessible
 * fallback; â–²â–¼ is instantly usable, screen-reader friendly, and about as fast
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
  currentUserId: string;
}) {
  const router = useRouter();

  const [gameId, setGameId] = useState(defaultGameId ?? games[0]?.id ?? "");
  // Aggressive defaulting: same game, same people as last time (spec Â§3).
  const [order, setOrder] = useState<string[]>(
    defaultParticipantIds.length > 0 ? defaultParticipantIds : members.slice(0, 2).map((m) => m.userId),
  );
  const [matchType, setMatchType] = useState<"competitive" | "casual">("competitive");
  const [showOptions, setShowOptions] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LoggedResult | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // Guests added during this session, appended to the roster locally so the
  // page does not need a full reload mid-flow.
  const [extraMembers, setExtraMembers] = useState<MemberOption[]>([]);
  const [guestName, setGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);

  // Team mode. Two buckets is what a table actually negotiates (spec Â§3);
  // the API accepts up to 8 teams if a richer UI is ever needed.
  const [mode, setMode] = useState<"ffa" | "teams">("ffa");
  const [teamA, setTeamA] = useState<string[]>([]);
  const [winningTeam, setWinningTeam] = useState<"A" | "B">("A");

  // Custom games added mid-flow (spec §12), appended locally like guests.
  const [extraGames, setExtraGames] = useState<GameOption[]>([]);
  const [addingGame, setAddingGame] = useState(false);
  const [newGameName, setNewGameName] = useState("");
  const [newGameTeams, setNewGameTeams] = useState(false);

  async function addGame(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newGameName.trim();
    if (!name) return;
    setPending(true);
    setError(null);
    try {
      const { game: created } = await api.post<{ game: GameOption }>("/api/games", {
        name,
        minPlayers: 2,
        supportsFfa: !newGameTeams,
        supportsTeams: newGameTeams,
        rankingMode: "full",
      });
      setExtraGames((current) => [...current, created]);
      setGameId(created.id);
      setNewGameName("");
      setNewGameTeams(false);
      setAddingGame(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't add that game.");
    } finally {
      setPending(false);
    }
  }

  const roster = useMemo(() => [...members, ...extraMembers], [members, extraMembers]);
  const game = [...games, ...extraGames].find((g) => g.id === gameId) ?? null;
  const winnerOnly = game?.rankingMode === "winner_only";
  // A teams-only game (Pool, Codenames) forces team mode; an FFA-only game
  // forces FFA. The toggle only matters when the game supports both.
  const effectiveMode: "ffa" | "teams" = !game
    ? "ffa"
    : !game.supportsFfa
      ? "teams"
      : !game.supportsTeams
        ? "ffa"
        : mode;
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

  /** Shuffle the selected players into two even buckets (spec Â§3). */
  function randomTeams() {
    const shuffled = [...order];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const half = Math.ceil(shuffled.length / 2);
    setTeamA(shuffled.slice(0, half));
  }

  const teamAList = order.filter((id) => teamA.includes(id));
  const teamBList = order.filter((id) => !teamA.includes(id));

  const countError =
    game && order.length < game.minPlayers
      ? `${game.name} needs at least ${game.minPlayers} players.`
      : game?.maxPlayers && order.length > game.maxPlayers
        ? `${game.name} supports at most ${game.maxPlayers} players.`
        : effectiveMode === "teams" && (teamAList.length === 0 || teamBList.length === 0)
          ? "Both teams need at least one player."
          : null;

  async function submit() {
    setPending(true);
    setError(null);
    const body =
        effectiveMode === "teams"
          ? {
              gameId,
              matchType,
              teamMode: "teams" as const,
              teams: [
                { name: "Team A", rank: winningTeam === "A" ? 1 : 2, userIds: teamAList },
                { name: "Team B", rank: winningTeam === "B" ? 1 : 2, userIds: teamBList },
              ],
              idempotencyKey: crypto.randomUUID(),
            }
          : {
              gameId,
              matchType,
              teamMode: "ffa" as const,
              participants: order.map((userId, index) => ({ userId, rank: index + 1 })),
              // Lets a retry after a flaky connection not double-log (spec Â§10).
              idempotencyKey: crypto.randomUUID(),
            };

    try {
      const payload = await api.post<LoggedResult>(`/api/groups/${slug}/matches`, body);
      setResult(payload);
      if (payload.participants.some((p) => p.userId === currentUserId && p.finalRank === 1)) {
        setShowConfetti(true);
      }
      router.refresh();
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.detail.message : "Couldn't log that match.";
      setError(message);
      if (!(err instanceof ApiRequestError)) {
        queueMatch(body, slug);
      }
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="animate-scale-in space-y-4">
        <Confetti trigger={showConfetti} />
        <Card glow>
          <p className="mb-3 text-[0.875rem] font-semibold">Match logged</p>
          <ul className="divide-y divide-border">
            {result.participants.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 py-2.5 text-[0.8125rem]">
                <span className="w-6 text-center font-semibold tabular-nums text-muted-dim">{p.finalRank}</span>
                <span className="flex-1 truncate font-medium">{p.displayName}</span>
                <Delta value={p.ratingDelta} />
              </li>
            ))}
          </ul>
        </Card>
        <UndoButton matchId={result.match.id} onUndone={() => setResult(null)} />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push(`/g/${slug}`)}>Back to standings</Button>
          <Button variant="ghost" onClick={() => setResult(null)}>Log another</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Game</h2>
        <div className="flex flex-wrap gap-1.5">
          {[...games, ...extraGames].map((g) => (
            <Chip key={g.id} active={g.id === gameId} onClick={() => setGameId(g.id)}>
              {g.name}
            </Chip>
          ))}
          {addingGame ? null : (
            <button
              type="button"
              onClick={() => setAddingGame(true)}
              className="inline-flex items-center rounded-full border border-dashed border-muted-dim px-3 py-1.5 text-[0.8125rem] font-medium text-muted-dim transition hover:border-muted hover:text-muted"
            >
              + Custom
            </button>
          )}
        </div>

        {addingGame ? (
          <form onSubmit={addGame} className="mt-2 space-y-2 rounded-xl border border-border bg-surface-2 p-3">
            <Field
              label="Game name"
              value={newGameName}
              onChange={(e) => setNewGameName(e.target.value)}
              autoFocus
            />
            <label className="flex items-center gap-2.5 text-[0.8125rem] font-medium">
              <input type="checkbox" checked={newGameTeams} onChange={(e) => setNewGameTeams(e.target.checked)} />
              <span>Played in teams</span>
            </label>
            <div className="flex gap-2">
              <Button size="sm" type="submit" variant="secondary" disabled={pending}>Add game</Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setAddingGame(false)}>Cancel</Button>
            </div>
          </form>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Who played?
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {roster.map((m) => (
            <Chip key={m.userId} active={order.includes(m.userId)} onClick={() => toggle(m.userId)}>
              {m.displayName}
            </Chip>
          ))}
          <button
            type="button"
            onClick={() => setAddingGuest(true)}
            className="inline-flex items-center rounded-full border border-dashed border-muted-dim px-3 py-1.5 text-[0.8125rem] font-medium text-muted-dim transition hover:border-muted hover:text-muted"
          >
            + Guest
          </button>
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

      {game?.supportsTeams && game?.supportsFfa ? (
        <div className="flex gap-2">
          {(["ffa", "teams"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm transition ${
                mode === m ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
              }`}
            >
              {m === "ffa" ? "Free-for-all" : "Teams"}
            </button>
          ))}
        </div>
      ) : null}

      {order.length > 0 && effectiveMode === "teams" ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Teams</h2>
            <button type="button" onClick={randomTeams} className="text-sm text-accent hover:underline">
              Random teams
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["A", "B"] as const).map((side) => {
              const list = side === "A" ? teamAList : teamBList;
              return (
                <button
                  key={side}
                  type="button"
                  onClick={() => setWinningTeam(side)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    winningTeam === side ? "border-accent bg-accent/10" : "border-border bg-surface"
                  }`}
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    Team {side} {winningTeam === side ? "Â· won" : ""}
                  </p>
                  <ul className="space-y-1">
                    {list.map((id) => (
                      <li key={id} className="truncate text-sm">
                        {byId.get(id)?.displayName}
                      </li>
                    ))}
                    {list.length === 0 ? <li className="text-xs text-muted">empty</li> : null}
                  </ul>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            Tap a team to mark it the winner. Tap a name below to move them between teams.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {order.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  setTeamA((current) =>
                    current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
                  )
                }
                className="rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:text-text"
              >
                {byId.get(id)?.displayName} → {teamA.includes(id) ? "B" : "A"}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {order.length > 0 && effectiveMode === "ffa" ? (
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
                    className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
                  >
                    <span className="w-6 text-center text-sm font-semibold tabular-nums text-muted-dim">
                      {index + 1}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">{byId.get(userId)?.displayName}</span>
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        aria-label={`Move ${byId.get(userId)?.displayName} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className="grid size-7 place-items-center rounded-md border border-border text-muted transition hover:border-muted hover:text-text active:scale-90 disabled:opacity-20 disabled:pointer-events-none"
                      >
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                          <path d="M1 5 5 1l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${byId.get(userId)?.displayName} down`}
                        disabled={index === order.length - 1}
                        onClick={() => move(index, 1)}
                        className="grid size-7 place-items-center rounded-md border border-border text-muted transition hover:border-muted hover:text-text active:scale-90 disabled:opacity-20 disabled:pointer-events-none"
                      >
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                          <path d="M1 1 5 5l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
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
          className="text-[0.8125rem] font-medium text-muted hover:text-text"
        >
          {showOptions ? "▲" : "▼"} More options
        </button>
        {showOptions ? (
          <div className="mt-3 flex gap-2">
            {(["competitive", "casual"] as const).map((type) => (
              <Chip key={type} active={matchType === type} onClick={() => setMatchType(type)}>
                {type}
              </Chip>
            ))}
          </div>
        ) : null}
        {matchType === "casual" ? (
          <p className="mt-2 text-[0.6875rem] text-muted-dim">Casual games don&apos;t affect ratings.</p>
        ) : null}
      </section>

      <ErrorBanner>{error ?? countError}</ErrorBanner>

      <Button onClick={submit} disabled={pending || !!countError || !gameId}>
        {pending ? "Logging…" : "Log match"}
      </Button>
    </div>
  );
}
