const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  getAllPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage
} = require("../controllers/packageController");


// Semua package
router.get("/", getAllPackages);

// Detail package
router.get("/:id", getPackageById);

// Tambah package
router.post(
  "/",
  auth,
  checkRole("admin"),
  createPackage
);

// Update package
router.put(
  "/:id",
  auth,
  checkRole("admin"),
  updatePackage
);

// Hapus package
router.delete(
  "/:id",
  auth,
  checkRole("admin"),
  deletePackage
);

module.exports = router;