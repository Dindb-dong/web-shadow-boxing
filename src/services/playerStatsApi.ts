import type { DifficultyLevel } from "../types/game";

export type MatchResult = "win" | "loss";

export interface PlayerSummary {
  playerId: string;
  totalMatches: number;
  wins: number;
  losses: number;
  totalHits: number;
  totalGuards: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  hitGuardRatio: number;
}

const PLAYER_ID_STORAGE_KEY = "shadowboxing.playerId";

function sanitizePlayerId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
}

async function postJson<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function bootstrapPlayer(preferredPlayerId: string | null): Promise<PlayerSummary> {
  const desiredId = preferredPlayerId ? sanitizePlayerId(preferredPlayerId) : "";
  const result = await postJson<{ player: PlayerSummary }>("/api/player/bootstrap", {
    playerId: desiredId || undefined
  });
  return result.player;
}

export async function renamePlayerId(currentPlayerId: string, nextPlayerId: string): Promise<PlayerSummary> {
  const result = await postJson<{ player: PlayerSummary }>("/api/player/rename", {
    fromPlayerId: sanitizePlayerId(currentPlayerId),
    toPlayerId: sanitizePlayerId(nextPlayerId)
  });
  return result.player;
}

export async function recordMatch(payload: {
  playerId: string;
  difficulty: DifficultyLevel;
  result: MatchResult;
  successfulHits: number;
  guardedCounters: number;
}): Promise<void> {
  await postJson("/api/match/record", {
    playerId: sanitizePlayerId(payload.playerId),
    difficulty: payload.difficulty,
    result: payload.result,
    successfulHits: payload.successfulHits,
    guardedCounters: payload.guardedCounters
  });
}

export async function fetchLeaderboard(
  difficulty: DifficultyLevel | "all" = "all",
  limit = 10
): Promise<LeaderboardEntry[]> {
  const response = await fetch(
    `/api/leaderboard?difficulty=${encodeURIComponent(difficulty)}&limit=${encodeURIComponent(`${limit}`)}`
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { entries: LeaderboardEntry[] };
  return payload.entries;
}

export function readStoredPlayerId(): string | null {
  const raw = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  const sanitized = sanitizePlayerId(raw);
  return sanitized || null;
}

export function storePlayerId(playerId: string): void {
  const sanitized = sanitizePlayerId(playerId);
  if (!sanitized) {
    return;
  }
  window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, sanitized);
}
