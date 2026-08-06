const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const pool = require("./config/db");

dotenv.config();

const app = express();


// Middleware
app.use(cors());
app.use(express.json());


// Routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");


// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);


// Home
app.get("/", (req, res) => {
  res.json({
    message: "Ticketing API Running",
  });
});


// Test koneksi database
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      success: true,
      message: "Berhasil terhubung ke database",
      data: result.rows,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
});


module.exports = app;