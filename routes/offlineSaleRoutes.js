const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  createOfflineSale,
  getOfflineSales,
  getEventOfflineSales,
} = require("../controllers/offlineSaleController");

// Create offline sale (petugas atau admin) - Validasi permission 'offline_sales' dilakukan di controller
router.post(
  "/",
  auth,
  checkRole("petugas", "admin"),
  createOfflineSale
);

// Get all offline sales (admin melihat semua; petugas hanya event miliknya)
router.get(
  "/",
  auth,
  checkRole("admin", "petugas"),
  getOfflineSales
);

// Get offline sales for specific event - Validasi permission 'view_reports' / 'offline_sales'
router.get(
  "/event/:eventId",
  auth,
  checkRole("admin", "petugas"),
  getEventOfflineSales
);

module.exports = router;
