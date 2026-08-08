const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  getAllBanners,
  getActiveBanners,
  createBanner,
  updateBanner,
  deleteBanner
} = require("../controllers/bannerController");


// Banner aktif - public
router.get("/active", getActiveBanners);

// Semua banner
router.get(
  "/",
  auth,
  checkRole("admin"),
  getAllBanners
);

// Tambah banner
router.post(
  "/",
  auth,
  checkRole("admin"),
  createBanner
);

// Update banner
router.put(
  "/:id",
  auth,
  checkRole("admin"),
  updateBanner
);

// Hapus banner
router.delete(
  "/:id",
  auth,
  checkRole("admin"),
  deleteBanner
);

module.exports = router;