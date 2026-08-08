const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const pool = require("./config/db");

dotenv.config();

const app = express();

// ===============================
// Middleware
// ===============================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ===============================
// Routes
// ===============================

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

const artistRoutes = require("./routes/artistRoutes");
const bannerRoutes = require("./routes/bannerRoutes");
const checkinRoutes = require("./routes/checkinRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const eventRoutes = require("./routes/eventRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const orderRoutes = require("./routes/orderRoutes");
const organizerRoutes = require("./routes/organizerRoutes");
const packageRoutes = require("./routes/packageRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const staffRoutes = require("./routes/staffRoutes");
const ticketRoutes = require("./routes/ticketRoutes");


// ===============================
// API Routes
// ===============================

// Auth & User
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// Artist
app.use("/api/artists", artistRoutes);

// Banner
app.use("/api/banners", bannerRoutes);

// Check-in
app.use("/api/checkins", checkinRoutes);

// Dashboard
app.use("/api/dashboard", dashboardRoutes);

// Event
app.use("/api/events", eventRoutes);

// Notification
app.use("/api/notifications", notificationRoutes);

// Order
app.use("/api/orders", orderRoutes);

// Organizer
app.use("/api/organizers", organizerRoutes);

// Cooperation Package
app.use("/api/packages", packageRoutes);

// Payment
app.use("/api/payments", paymentRoutes);

// Staff
app.use("/api/staff", staffRoutes);

// Ticket
app.use("/api/tickets", ticketRoutes);




// ===============================
// Home
// ===============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Ticketing API Running",
  });
});


// ===============================
// Test Database
// ===============================

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      success: true,
      message: "Berhasil terhubung ke database",
      data: result.rows,
    });

  } catch (error) {
    console.error("Database error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});


// ===============================
// 404 Handler
// ===============================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint tidak ditemukan",
  });
});


// ===============================
// Error Handler
// ===============================

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});


module.exports = app;