const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  getDashboard,
  getEventStatistics
} = require("../controllers/dashboardController");


// Dashboard admin
router.get(
  "/",
  auth,
  checkRole("admin"),
  getDashboard
);

// Statistik event
router.get(
  "/events",
  auth,
  checkRole("admin"),
  getEventStatistics
);

module.exports = router;