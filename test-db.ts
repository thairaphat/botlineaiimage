import * as mariadb from "mariadb";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("No DATABASE_URL");

const url = new URL(databaseUrl);

async function test() {
  console.log("Testing connection to:", url.hostname);
  const pool = mariadb.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace("/", ""),
    connectTimeout: 5000
  });

  try {
    const conn = await pool.getConnection();
    console.log("Connected successfully!");
    const rows = await conn.query("SELECT 1 as val");
    console.log("Query result:", rows);
    conn.release();
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await pool.end();
  }
}

test();
