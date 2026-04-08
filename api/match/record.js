import { getDb } from "../_lib/mongo.js";
import {
  createDefaultPlayerDocument,
  difficultyOrDefault,
  parseBody,
  sanitizePlayerId,
  validatePlayerId
} from "../_lib/player.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = parseBody(req);
    const playerId = sanitizePlayerId(body.playerId ?? "");
    const difficulty = difficultyOrDefault(body.difficulty);
    const result = body.result === "win" ? "win" : "loss";
    const successfulHits = Number.isFinite(body.successfulHits) ? Math.max(0, Number(body.successfulHits)) : 0;
    const guardedCounters = Number.isFinite(body.guardedCounters) ? Math.max(0, Number(body.guardedCounters)) : 0;

    if (!validatePlayerId(playerId)) {
      res.status(400).json({ error: "playerId must match /^[a-z0-9_-]{3,24}$/" });
      return;
    }

    const db = await getDb();
    const players = db.collection("players");
    const matches = db.collection("matches");
    await players.createIndex({ playerId: 1 }, { unique: true });
    await matches.createIndex({ playerId: 1, createdAt: -1 });
    await matches.createIndex({ difficulty: 1, createdAt: -1 });

    const now = new Date();
    const existing = await players.findOne({ playerId }, { projection: { _id: 1 } });
    if (!existing) {
      await players.insertOne(createDefaultPlayerDocument(playerId, now));
    }

    await matches.insertOne({
      playerId,
      difficulty,
      result,
      successfulHits,
      guardedCounters,
      createdAt: now
    });

    await players.updateOne(
      { playerId },
      {
        $inc: {
          totalMatches: 1,
          wins: result === "win" ? 1 : 0,
          losses: result === "loss" ? 1 : 0,
          totalHits: successfulHits,
          totalGuards: guardedCounters,
          [`difficulties.${difficulty}.matches`]: 1,
          [`difficulties.${difficulty}.wins`]: result === "win" ? 1 : 0,
          [`difficulties.${difficulty}.losses`]: result === "loss" ? 1 : 0
        },
        $set: { updatedAt: now }
      }
    );

    res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "record failed";
    console.error("[api/match/record] failed:", error);
    res.status(500).json({ error: message });
  }
}
