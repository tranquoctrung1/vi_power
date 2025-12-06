const { MongoClient } = require("mongodb");

let db = null;
let client = null;

async function connectToDatabase() {
  if (db) return db;

  try {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db();
    console.log("📦 Database connected successfully");
    return db;
  } catch (error) {
    console.error("Database connection failed:", error);
    throw error;
  }
}

function getDatabase() {
  if (!db) {
    throw new Error("Database not connected. Call connectToDatabase first.");
  }
  return db;
}

async function closeDatabaseConnection() {
  if (client) {
    await client.close();
    console.log("Database connection closed");
    db = null;
    client = null;
  }
}

module.exports = {
  connectToDatabase,
  getDatabase,
  closeDatabaseConnection,
};
