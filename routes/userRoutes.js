const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  getProfile,
  getAllUsers,
  updateProfile,
  deleteUser
} = require("../controllers/userController");


// user lihat profile
router.get(
  "/profile",
  auth,
  getProfile
);


// admin lihat semua user
router.get(
  "/",
  auth,
  checkRole("admin"),
  getAllUsers
);


// user update profile
router.put(
  "/profile",
  auth,
  updateProfile
);


// admin hapus user
router.delete(
  "/:id",
  auth,
  checkRole("admin"),
  deleteUser
);


module.exports = router;