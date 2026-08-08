const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  checkinTicket,
  getEventCheckins
} = require("../controllers/checkinController");


// Check-in tiket
router.post(
  "/",
  auth,
  checkRole("petugas"),
  checkinTicket
);

// Riwayat check-in event
router.get(
  "/event/:eventId",
  auth,
  checkRole("admin", "petugas"),
  getEventCheckins
);

module.exports = router;