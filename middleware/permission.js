const pool = require("../config/db");

const VALID_PERMISSIONS = [
  "checkin",
  "offline_sales",
  "view_visitors",
  "view_reports"
];

/**
 * Helper function untuk verifikasi permission staff pada event tertentu.
 * Dapat dipanggil langsung di dalam controller atau transaksi database.
 * 
 * @param {object} clientOrPool - Pool atau Client pg
 * @param {string} userId - UUID user yang sedang login
 * @param {string} eventId - UUID event target
 * @param {string} requiredPermission - Salah satu dari VALID_PERMISSIONS
 * @param {string} userRole - Role user (jika 'admin', otomatis lolos)
 * @returns {Promise<{ allowed: boolean, reason?: string, staffId?: number, isAdmin?: boolean }>}
 */
async function verifyStaffPermission(clientOrPool, userId, eventId, requiredPermission, userRole = "petugas") {
  // Admin selalu memiliki akses penuh ke seluruh event dan fitur
  if (userRole === "admin") {
    return { allowed: true, isAdmin: true };
  }

  if (!VALID_PERMISSIONS.includes(requiredPermission)) {
    return { allowed: false, reason: `Permission '${requiredPermission}' tidak valid dalam sistem` };
  }

  if (!eventId) {
    return { allowed: false, reason: "Event ID wajib disertakan untuk validasi permission" };
  }

  // 1. Cek apakah user terdaftar pada event_staff dan berstatus aktif (is_active = true)
  const staffRes = await clientOrPool.query(
    `SELECT es.id, es.is_active
     FROM event_staff es
     WHERE es.event_id = $1 AND es.user_id = $2`,
    [eventId, userId]
  );

  if (staffRes.rows.length === 0) {
    return { allowed: false, reason: "Anda tidak ditugaskan pada event ini" };
  }

  const staff = staffRes.rows[0];

  if (!staff.is_active) {
    return { allowed: false, reason: "Penugasan Anda pada event ini sedang dinonaktifkan oleh Admin" };
  }

  // 2. Cek apakah petugas memiliki permission yang diminta di event_staff_permissions
  const permRes = await clientOrPool.query(
    `SELECT id 
     FROM event_staff_permissions
     WHERE event_staff_id = $1 AND permission = $2`,
    [staff.id, requiredPermission]
  );

  if (permRes.rows.length === 0) {
    return {
      allowed: false,
      reason: `Anda tidak memiliki izin '${requiredPermission}' untuk event ini`
    };
  }

  return { allowed: true, staffId: staff.id };
}

/**
 * Express Middleware untuk memvalidasi hak akses penugasan dan permission event.
 * 
 * @param {string} requiredPermission - Permission yang wajib dimiliki (checkin, offline_sales, view_visitors, view_reports)
 * @param {"params"|"body"|"auto"} eventIdSource - Lokasi pengambilan eventId dari request
 */
function checkEventPermission(requiredPermission, eventIdSource = "auto") {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "User belum login"
        });
      }

      // Admin selalu lolos
      if (req.user.role === "admin") {
        return next();
      }

      let eventId = null;

      if (eventIdSource === "params") {
        eventId = req.params.eventId || req.params.id;
      } else if (eventIdSource === "body") {
        eventId = req.body.event_id || req.body.eventId;
      } else {
        // "auto" prioritaskan params kemudian body
        eventId = req.params.eventId || req.params.id || req.body.event_id || req.body.eventId;
      }

      if (!eventId) {
        return res.status(400).json({
          success: false,
          message: "Event ID tidak ditemukan pada request"
        });
      }

      const result = await verifyStaffPermission(
        pool,
        req.user.id,
        eventId,
        requiredPermission,
        req.user.role
      );

      if (!result.allowed) {
        return res.status(403).json({
          success: false,
          message: result.reason
        });
      }

      req.staffAssignmentId = result.staffId;
      next();
    } catch (error) {
      console.error("Check Event Permission Middleware Error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat memverifikasi izin petugas"
      });
    }
  };
}

module.exports = {
  VALID_PERMISSIONS,
  verifyStaffPermission,
  checkEventPermission
};

