const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  createOrder,
  getMyOrders,
  getOrderById,
  getAllOrders
} = require("../controllers/orderController");


// Buat order
router.post(
  "/",
  auth,
  checkRole("user"),
  createOrder
);

// Order milik user
router.get(
  "/my",
  auth,
  checkRole("user"),
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