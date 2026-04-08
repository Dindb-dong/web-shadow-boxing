import { MongoClient } from "mongodb";

const dbName = process.env.MONGODB_DB || "shadowboxing";

let cachedClient = globalThis.__shadowboxingMongoClient;
let cachedDb = globalThis.__shadowboxingMongoDb;

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI environment variable");
  }

  if (cachedDb && cachedClient) {
    return cachedDb;
  }

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0
  });
  await client.connect();

  const db = client.db(dbName);
  cachedClient = client;
  cachedDb = db;
  globalThis.__shadowboxingMongoClient = client;
  globalThis.__shadowboxingMongoDb = db;
  return db;
}
