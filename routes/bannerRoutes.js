const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");
const upload = require("../middleware/upload");

const {
  getAllBanners,
  getActiveBanners,
  createBanner,
  updateBanner,
  toggleBannerStatus,
  uploadBannerImage,
  deleteBanner
} = require("../controllers/bannerController");

// Banner aktif - public (Tampilan User)
router.get("/active", getActiveBanners);

// Semua banner (Admin)
router.get("/", auth, checkRole("admin"), getAllBanners);

// Upload gambar banner terpisah (Admin)
router.post(
  "/upload",
  auth,
  checkRole("admin"),
  upload.single("image"),
  uploadBannerImage
);

// Tambah banner (Admin, mendukung json atau multipart/form-data)
router.post(
  "/",
  auth,
  checkRole("admin"),
  upload.single("image"),
  createBanner
);

// Update banner (Admin)
router.put(
  "/:id",
  auth,
  checkRole("admin"),
  upload.single("image"),
  updateBanner
);

// Toggle status aktif/nonaktif banner (Admin)
router.patch(
  "/:id/toggle",
  auth,
  checkRole("admin"),
  toggleBannerStatus
);

// Hapus banner (Admin)
router.delete(
  "/:id",
  auth,
  checkRole("admin"),
  deleteBanner
);

module.exports = router;
