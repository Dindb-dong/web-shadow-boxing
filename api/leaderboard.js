import { getDb } from "./_lib/mongo.js";

const ALLOWED_DIFFICULTIES = new Set(["all", "beginner", "intermediate", "expert"]);

function toNumber(value, fallback) {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const difficultyQuery = `${req.query.difficulty ?? "all"}`.toLowerCase();
    const difficulty = ALLOWED_DIFFICULTIES.has(difficultyQuery) ? difficultyQuery : "all";
    const limit = Math.max(1, Math.min(50, toNumber(req.query.limit, 10)));

    const db = await getDb();
    const players = await db
      .collection("players")
      .find({}, { projection: { _id: 0, playerId: 1, totalMatches: 1, wins: 1, losses: 1, totalHits: 1, totalGuards: 1, difficulties: 1 } })
      .toArray();

    const rows = players
      .map((player) => {
        if (difficulty === "all") {
          const matches = player.totalMatches ?? 0;
          const wins = player.wins ?? 0;
          const losses = player.losses ?? 0;
          const totalHits = player.totalHits ?? 0;
          const totalGuards = player.totalGuards ?? 0;
          return { playerId: player.playerId, matches, wins, losses, totalHits, totalGuards };
        }

        const stat = player.difficulties?.[difficulty] ?? { matches: 0, wins: 0, losses: 0 };
        return {
          playerId: player.playerId,
          matches: stat.matches ?? 0,
          wins: stat.wins ?? 0,
          losses: stat.losses ?? 0,
          totalHits: player.totalHits ?? 0,
          totalGuards: player.totalGuards ?? 0
        };
      })
      .filter((row) => row.matches > 0)
      .map((row) => {
        const winRate = row.matches > 0 ? row.wins / row.matches : 0;
        const hitGuardRatio = row.totalGuards > 0 ? row.totalHits / row.totalGuards : row.totalHits;
        return { ...row, winRate, hitGuardRatio };
      })
      .sort((a, b) => {
        if (b.winRate !== a.winRate) {
          return b.winRate - a.winRate;
        }
        if (b.matches !== a.matches) {
          return b.matches - a.matches;
        }
        return b.hitGuardRatio - a.hitGuardRatio;
      })
      .slice(0, limit)
      .map((row, index) => ({
        rank: index + 1,
        playerId: row.playerId,
        matches: row.matches,
        wins: row.wins,
        losses: row.losses,
        winRate: Number(row.winRate.toFixed(4)),
        hitGuardRatio: Number(row.hitGuardRatio.toFixed(4))
      }));

    res.status(200).json({ difficulty, entries: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "leaderboard failed";
    console.error("[api/leaderboard] failed:", error);
    res.status(500).json({ error: message });
  }
}
