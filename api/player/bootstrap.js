import { getDb } from "../_lib/mongo.js";
import {
  createDefaultPlayerDocument,
  createRandomPlayerId,
  parseBody,
  sanitizePlayerId,
  toPlayerSummary,
  validatePlayerId
} from "../_lib/player.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = parseBody(req);
    const db = await getDb();
    const players = db.collection("players");
    await players.createIndex({ playerId: 1 }, { unique: true });

    let playerId = sanitizePlayerId(body.playerId ?? "");
    if (playerId && !validatePlayerId(playerId)) {
      res.status(400).json({ error: "playerId must match /^[a-z0-9_-]{3,24}$/" });
      return;
    }

    if (!playerId) {
      let attempts = 0;
      while (attempts < 10) {
        const candidate = createRandomPlayerId();
        const exists = await players.findOne({ playerId: candidate }, { projection: { _id: 1 } });
        if (!exists) {
          playerId = candidate;
          break;
        }
        attempts += 1;
      }
      if (!playerId) {
        res.status(500).json({ error: "failed to allocate playerId" });
        return;
      }
    }

    const existing = await players.findOne({ playerId });
    if (existing) {
      res.status(200).json({ created: false, player: toPlayerSummary(existing) });
      return;
    }

    const now = new Date();
    const playerDoc = createDefaultPlayerDocument(playerId, now);
    await players.insertOne(playerDoc);
    res.status(200).json({ created: true, player: toPlayerSummary(playerDoc) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "bootstrap failed";
    res.status(500).json({ error: message });
  }
}
