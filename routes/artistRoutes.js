const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  getAllArtists,
  getArtistById,
  createArtist,
  updateArtist,
  deleteArtist,
  addArtistToEvent,
  getEventArtists,
  removeArtistFromEvent
} = require("../controllers/artistController");


// Semua artist
router.get("/", getAllArtists);

// Detail artist
router.get("/:id", getArtistById);

// Tambah artist
router.post(
  "/",
  auth,
  checkRole("admin"),
  createArtist
);

// Update artist
router.put(
  "/:id",
  auth,
  checkRole("admin"),
  updateArtist
);

// Hapus artist
router.delete(
  "/:id",
  auth,
  checkRole("admin"),
  deleteArtist
);


// Artist dalam event
router.get(
  "/event/:eventId",
  getEventArtists
);

// Tambahkan artist ke event
router.post(
  "/event",
  auth,
  checkRole("admin"),
  addArtistToEvent
);

// Hapus artist dari event
router.delete(
  "/event/:eventId/:artistId",
  auth,
  checkRole("admin"),
  removeArtistFromEvent
);

module.exports = router;