const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  getCategoriesByEvent,
  createTicketCategory,
  updateTicketCategory,
  deleteTicketCategory,
  getMyTickets,
  getTicketByCode
} = require("../controllers/ticketController");


// ===============================
// TICKET CATEGORY
// ===============================

// Kategori tiket berdasarkan event
router.get(
  "/category/event/:eventId",
  getCategoriesByEvent
);

// Buat kategori tiket
router.post(
  "/category",
  auth,
  checkRole("admin"),
  createTicketCategory
);

// Update kategori tiket
router.put(
  "/category/:id",
  auth,
  checkRole("admin"),
  updateTicketCategory
);

// Hapus kategori tiket
router.delete(
  "/category/:id",
  auth,
  checkRole("admin"),
  deleteTicketCategory
);


// ===============================
// TICKETS
// ===============================

// Tiket milik user
router.get(
  "/my",
  auth,
  checkRole("user"),
  getMyTickets
);

// Cari tiket berdasarkan kode
router.get(
  "/code/:code",
  auth,
  checkRole("admin", "petugas"),
  getTicketByCode
);

module.exports = router;