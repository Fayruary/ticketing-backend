const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  getAllOrganizers,
  getOrganizerById,
  createOrganizer,
  updateOrganizer,
  deleteOrganizer
} = require("../controllers/organizerController");


// Semua organizer
router.get("/", getAllOrganizers);

// Detail organizer
router.get("/:id", getOrganizerById);

// Tambah organizer
router.post(
  "/",
  auth,
  checkRole("admin"),
  createOrganizer
);

// Update organizer
router.put(
  "/:id",
  auth,
  checkRole("admin"),
  updateOrganizer
);

// Hapus organizer
router.delete(
  "/:id",
  auth,
  checkRole("admin"),
  deleteOrganizer
);

module.exports = router;