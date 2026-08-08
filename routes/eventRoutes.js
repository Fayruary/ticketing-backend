const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  publishEvent
} = require("../controllers/eventController");


// Semua event - public
router.get("/", getAllEvents);

// Detail event - public
router.get("/:id", getEventById);

// Buat event
router.post(
  "/",
  auth,
  checkRole("admin"),
  createEvent
);

// Update event
router.put(
  "/:id",
  auth,
  checkRole("admin"),
  updateEvent
);

// Publish event
router.patch(
  "/:id/publish",
  auth,
  checkRole("admin"),
  publishEvent
);

// Hapus event
router.delete(
  "/:id",
  auth,
  checkRole("admin"),
  deleteEvent
);

module.exports = router;