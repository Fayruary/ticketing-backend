const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  getMyNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require("../controllers/notificationController");


// Notification milik user
router.get(
  "/",
  auth,
  getMyNotifications
);

// Buat notification
router.post(
  "/",
  auth,
  checkRole("admin"),
  createNotification
);

// Tandai satu notification sudah dibaca
router.patch(
  "/:id/read",
  auth,
  markAsRead
);

// Tandai semua notification sudah dibaca
router.patch(
  "/read-all",
  auth,
  markAllAsRead
);

// Hapus notification
router.delete(
  "/:id",
  auth,
  deleteNotification
);

module.exports = router;