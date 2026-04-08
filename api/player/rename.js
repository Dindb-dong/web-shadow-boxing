import { getDb } from "../_lib/mongo.js";
import { parseBody, sanitizePlayerId, toPlayerSummary, validatePlayerId } from "../_lib/player.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = parseBody(req);
    const fromPlayerId = sanitizePlayerId(body.fromPlayerId ?? "");
    const toPlayerId = sanitizePlayerId(body.toPlayerId ?? "");

    if (!validatePlayerId(fromPlayerId) || !validatePlayerId(toPlayerId)) {
      res.status(400).json({ error: "playerId must match /^[a-z0-9_-]{3,24}$/" });
      return;
    }
    if (fromPlayerId === toPlayerId) {
      res.status(400).json({ error: "toPlayerId must be different" });
      return;
    }

    const db = await getDb();
    const players = db.collection("players");
    const matches = db.collection("matches");
    await players.createIndex({ playerId: 1 }, { unique: true });

    const source = await players.findOne({ playerId: fromPlayerId });
    if (!source) {
      res.status(404).json({ error: "source player not found" });
      return;
    }
    const target = await players.findOne({ playerId: toPlayerId }, { projection: { _id: 1 } });
    if (target) {
      res.status(409).json({ error: "target playerId already exists" });
      return;
    }

    const now = new Date();
    await players.updateOne({ playerId: fromPlayerId }, { $set: { playerId: toPlayerId, updatedAt: now } });
    await matches.updateMany({ playerId: fromPlayerId }, { $set: { playerId: toPlayerId } });
    const renamed = await players.findOne({ playerId: toPlayerId });
    res.status(200).json({ player: toPlayerSummary(renamed) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "rename failed";
    console.error("[api/player/rename] failed:", error);
    res.status(500).json({ error: message });
  }
}
