const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Test koneksi
pool.connect((err, client, release) => {
  if (err) {
    return console.error("Gagal terhubung ke PostgreSQL:", err.message);
  }

  console.log("Berhasil terhubung ke PostgreSQL (Supabase)");
  release();
});

module.exports = pool;