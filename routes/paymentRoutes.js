const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  createPayment,
  getPaymentByOrder,
  updatePaymentStatus,
  handleMidtransNotification
} = require("../controllers/paymentController");

// Midtrans Webhook Notification (No JWT auth, Midtrans calls this directly)
router.post(
  "/notification",
  handleMidtransNotification
);

// Buat payment
router.post(
  "/",
  auth,
  checkRole("user", "admin"),
  createPayment
);

// Payment berdasarkan order
router.get(
  "/order/:orderId",
  auth,
  getPaymentByOrder
);

// Update status payment (manual admin)
router.patch(
  "/:id/status",
  auth,
  checkRole("admin"),
  updatePaymentStatus
);

module.exports = router;
