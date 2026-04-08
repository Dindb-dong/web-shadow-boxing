const PLAYER_ID_PATTERN = /^[a-z0-9_-]{3,24}$/;
const DIFFICULTIES = ["beginner", "intermediate", "expert"];

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

export function sanitizePlayerId(input) {
  if (typeof input !== "string") {
    return "";
  }
  return input.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
}

export function validatePlayerId(playerId) {
  return PLAYER_ID_PATTERN.test(playerId);
}

export function createRandomPlayerId() {
  return `sbx-${randomSuffix()}`;
}

export function createDefaultPlayerDocument(playerId, now) {
  return {
    playerId,
    totalMatches: 0,
    wins: 0,
    losses: 0,
    totalHits: 0,
    totalGuards: 0,
    difficulties: {
      beginner: { matches: 0, wins: 0, losses: 0 },
      intermediate: { matches: 0, wins: 0, losses: 0 },
      expert: { matches: 0, wins: 0, losses: 0 }
    },
    createdAt: now,
    updatedAt: now
  };
}

export function toPlayerSummary(playerDoc) {
  return {
    playerId: playerDoc.playerId,
    totalMatches: playerDoc.totalMatches ?? 0,
    wins: playerDoc.wins ?? 0,
    losses: playerDoc.losses ?? 0,
    totalHits: playerDoc.totalHits ?? 0,
    totalGuards: playerDoc.totalGuards ?? 0
  };
}

export function difficultyOrDefault(input) {
  return DIFFICULTIES.includes(input) ? input : "intermediate";
}

export function parseBody(req) {
  if (!req.body) {
    return {};
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}
