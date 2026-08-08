const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  getEventStaff,
  assignStaff,
  removeStaff
} = require("../controllers/staffController");


// Staff dalam event
router.get(
  "/event/:eventId",
  auth,
  checkRole("admin"),
  getEventStaff
);

// Assign staff ke event
router.post(
  "/",
  auth,
  checkRole("admin"),
  assignStaff
);

// Hapus staff dari event
router.delete(
  "/event/:eventId/:userId",
  auth,
  checkRole("admin"),
  removeStaff
);

module.exports = router;