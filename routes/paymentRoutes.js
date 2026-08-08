const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  createPayment,
  getPaymentByOrder,
  updatePaymentStatus
} = require("../controllers/paymentController");


// Buat payment
router.post(
  "/",
  auth,
  checkRole("user"),
  createPayment
);

// Payment berdasarkan order
router.get(
  "/order/:orderId",
  auth,
  getPaymentByOrder
);

// Update status payment
router.patch(
  "/:id/status",
  auth,
  checkRole("admin"),
  updatePaymentStatus
);

module.exports = router;