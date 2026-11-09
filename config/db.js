const { Pool } = require("pg");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const isSSL = process.env.DATABASE_SSL === "true";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isSSL ? { rejectUnauthorized: false } : false,
});

// Test koneksi
pool.connect((err, client, release) => {
  if (err) {
    return console.error(
      "Gagal terhubung ke PostgreSQL:",
      err.message
    );
  }

  console.log("Berhasil terhubung ke PostgreSQL (Supabase)");
  release();
});

module.exports = pool;