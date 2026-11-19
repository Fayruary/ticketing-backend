const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");
const { checkEventPermission } = require("../middleware/permission");

const {
  checkinTicket,
  getEventCheckins,
} = require("../controllers/checkinController");

// Check-in tiket (Scan QR Code) - Role: petugas atau admin
router.post(
  "/",
  auth,
  checkRole("petugas", "admin"),
  checkinTicket
);

// Riwayat check-in / daftar pengunjung event - Wajib permission 'view_visitors'
router.get(
  "/event/:eventId",
  auth,
  checkRole("admin", "petugas"),
  checkEventPermission("view_visitors", "params"),
  getEventCheckins
);

module.exports = router;
