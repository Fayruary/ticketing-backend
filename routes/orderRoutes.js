const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const checkRole = require("../middleware/role");

const {
  createCheckoutOrder,
  createOrder,
  getOrderStatus,
  simulatePayment,
  getOrderETickets,
  getMyOrders,
  getOrderById,
  getAllOrders
} = require("../controllers/orderController");

// Checkout Multi-Step Artatix (supports both logged-in users & guest checkout)
router.post(
  "/checkout",
  optionalAuth,
  createCheckoutOrder
);

// Backward compatibility create order
router.post(
  "/",
  auth,
  checkRole("user", "admin"),
  createOrder
);

// Order status polling / verification
router.get(
  "/:id/status",
  optionalAuth,
  getOrderStatus
);

// E-Tickets for confirmed order (Step 4)
router.get(
  "/:id/e-tickets",
  optionalAuth,
  getOrderETickets
);

// Simulation of Midtrans Sandbox settlement for demo/testing
router.post(
  "/:id/simulate-payment",
  optionalAuth,
  simulatePayment
);

// Order milik user
router.get(
  "/my",
  auth,
  checkRole("user", "admin"),
  getMyOrders
);

// Semua order - admin
router.get(
  "/",
  auth,
  checkRole("admin"),
  getAllOrders
);

// Detail order
router.get(
  "/:id",
  auth,
  getOrderById
);

module.exports = router;
