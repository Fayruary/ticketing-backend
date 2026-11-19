const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const checkRole = require("../middleware/role");

const {
  createStaffAccount,
  getAllPetugasUsers,
  getMyAssignedEvents,
  getEventStaff,
  getAllStaffAssignments,
  assignStaff,
  updateStaffPermissions,
  toggleStaffStatus,
  removeStaffById,
  removeStaff,
} = require("../controllers/staffController");

// ==========================================
// RUTE PETUGAS & ADMIN
// ==========================================

// Petugas/Admin: Ambil daftar event yang ditugaskan kepada user yang sedang login
router.get(
  "/my-events",
  auth,
  checkRole("petugas", "admin"),
  getMyAssignedEvents
);

// ==========================================
// RUTE KHUSUS ADMIN
// ==========================================

// Admin: Buat akun petugas baru (role = 'petugas')
router.post(
  "/users",
  auth,
  checkRole("admin"),
  createStaffAccount
);

// Admin: Ambil semua user dengan role 'petugas'
router.get(
  "/users",
  auth,
  checkRole("admin"),
  getAllPetugasUsers
);

// Admin: Ambil semua riwayat penugasan staff di semua event (overview)
router.get(
  "/assignments",
  auth,
  checkRole("admin"),
  getAllStaffAssignments
);

// Admin: Ambil staff dalam suatu event spesifik beserta permission & status aktif
router.get(
  "/event/:eventId",
  auth,
  checkRole("admin"),
  getEventStaff
);

// Admin: Tugaskan petugas ke event sekaligus menentukan permissions awal
router.post(
  "/",
  auth,
  checkRole("admin"),
  assignStaff
);

// Admin: Update permissions petugas pada suatu event (berdasarkan event_staff.id)
router.put(
  "/:id/permissions",
  auth,
  checkRole("admin"),
  updateStaffPermissions
);

// Admin: Toggle atau set status aktif/nonaktif penugasan petugas
router.patch(
  "/:id/status",
  auth,
  checkRole("admin"),
  toggleStaffStatus
);

// Admin: Hapus penugasan staff berdasarkan ID event_staff
router.delete(
  "/:id",
  auth,
  checkRole("admin"),
  removeStaffById
);

// Admin: Hapus penugasan staff berdasarkan eventId dan userId (backward compatible)
router.delete(
  "/event/:eventId/:userId",
  auth,
  checkRole("admin"),
  removeStaff
);

module.exports = router;
