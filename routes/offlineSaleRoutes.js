const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  createOfflineSale,
  getOfflineSales,
  getEventOfflineSales
} = require("../controllers/offlineSaleController");

// Create offline sale (petugas or admin)
router.post(
  "/",
  auth,
  checkRole("petugas", "admin"),
  createOfflineSale
);

// Get all offline sales
router.get(
  "/",
  auth,
  checkRole("admin", "petugas"),
  getOfflineSales
);

// Get offline sales for specific event
router.get(
  "/event/:eventId",
  auth,
  checkRole("admin", "petugas"),
  getEventOfflineSales
);

module.exports = router;
