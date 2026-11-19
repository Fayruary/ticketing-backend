const bcrypt = require("bcrypt");
const pool = require("../config/db");
const { VALID_PERMISSIONS } = require("../middleware/permission");

// ==========================================
// 1. ADMIN: BUAT AKUN PETUGAS BARU
// ==========================================
const createStaffAccount = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validasi input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Nama, email, dan password wajib diisi",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password minimal 6 karakter",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid",
      });
    }

    // Cek apakah email sudah terdaftar
    const checkUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    if (checkUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Email sudah terdaftar dalam sistem",
      });
    }

    // Hash password menggunakan bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Simpan user dengan role 'petugas'
    const result = await pool.query(
      `
      INSERT INTO users
      (name, email, phone, password, role)
      VALUES ($1, $2, $3, $4, 'petugas')
      RETURNING id, name, email, phone, role, created_at
      `,
      [
        name.trim(),
        email.trim().toLowerCase(),
        phone ? phone.trim() : null,
        hashedPassword,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Akun petugas berhasil dibuat",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create Staff Account Error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server saat membuat akun petugas",
    });
  }
};

// ==========================================
// 2. ADMIN: AMBIL SEMUA USER ROLE 'PETUGAS'
// ==========================================
const getAllPetugasUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.phone, 
        u.role, 
        u.created_at,
        COUNT(DISTINCT es.event_id)::int AS total_assigned_events,
        COUNT(DISTINCT CASE WHEN es.is_active = true THEN es.event_id END)::int AS active_assigned_events
      FROM users u
      LEFT JOIN event_staff es ON es.user_id = u.id
      WHERE u.role = 'petugas'
      GROUP BY u.id
      ORDER BY u.name ASC
    `);

    res.json({
      success: true,
      total: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get All Petugas Users Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar petugas",
    });
  }
};

// ==========================================
// 3. PETUGAS: EVENT YANG DITUGASKAN & AKTIF
// ==========================================
const getMyAssignedEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Jika admin yang mengakses, tampilkan semua event dengan semua permissions
    if (userRole === "admin") {
      const allEvents = await pool.query(`
        SELECT
          e.id AS event_id,
          e.name AS event_name,
          e.description,
          e.poster,
          e.city,
          e.venue,
          e.capacity,
          e.event_date,
          e.event_time,
          e.status AS event_status,
          true AS is_active,
          json_build_array('checkin', 'offline_sales', 'view_visitors', 'view_reports') AS permissions
        FROM events e
        ORDER BY e.event_date ASC
      `);

      return res.json({
        success: true,
        role: "admin",
        total: allEvents.rows.length,
        data: allEvents.rows,
      });
    }

    // Untuk role 'petugas': Hanya event yang ditugaskan dan berstatus aktif (is_active = true)
    const result = await pool.query(
      `
      SELECT
        es.id AS event_staff_id,
        es.is_active,
        es.created_at AS assigned_at,
        e.id AS event_id,
        e.name AS event_name,
        e.description,
        e.poster,
        e.city,
        e.venue,
        e.capacity,
        e.event_date,
        e.event_time,
        e.status AS event_status,
        COALESCE(
          json_agg(esp.permission ORDER BY esp.permission) FILTER (WHERE esp.permission IS NOT NULL),
          '[]'::json
        ) AS permissions
      FROM event_staff es
      JOIN events e ON e.id = es.event_id
      LEFT JOIN event_staff_permissions esp ON esp.event_staff_id = es.id
      WHERE es.user_id = $1 AND es.is_active = true
      GROUP BY es.id, es.is_active, es.created_at, e.id
      ORDER BY e.event_date ASC
      `,
      [userId]
    );

    res.json({
      success: true,
      role: "petugas",
      total: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get My Assigned Events Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar event yang ditugaskan",
    });
  }
};

// ==========================================
// 4. ADMIN: AMBIL STAFF DALAM SUATU EVENT
// ==========================================
const getEventStaff = async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await pool.query(
      `
      SELECT
        es.id AS event_staff_id,
        es.event_id,
        es.is_active,
        es.created_at AS assigned_at,
        u.id AS user_id,
        u.name,
        u.email,
        u.phone,
        u.role,
        COALESCE(
          json_agg(esp.permission ORDER BY esp.permission) FILTER (WHERE esp.permission IS NOT NULL),
          '[]'::json
        ) AS permissions
      FROM event_staff es
      JOIN users u ON u.id = es.user_id
      LEFT JOIN event_staff_permissions esp ON esp.event_staff_id = es.id
      WHERE es.event_id = $1
      GROUP BY es.id, es.event_id, es.is_active, es.created_at, u.id, u.name, u.email, u.phone, u.role
      ORDER BY u.name ASC
      `,
      [eventId]
    );

    res.json({
      success: true,
      total: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Event Staff Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar staff event",
    });
  }
};

// ==========================================
// 5. ADMIN: AMBIL SEMUA PENUGASAN (OVERVIEW)
// ==========================================
const getAllStaffAssignments = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        es.id AS event_staff_id,
        es.is_active,
        es.created_at AS assigned_at,
        e.id AS event_id,
        e.name AS event_name,
        e.poster AS event_poster,
        e.event_date,
        u.id AS user_id,
        u.name AS staff_name,
        u.email AS staff_email,
        u.phone AS staff_phone,
        COALESCE(
          json_agg(esp.permission ORDER BY esp.permission) FILTER (WHERE esp.permission IS NOT NULL),
          '[]'::json
        ) AS permissions
      FROM event_staff es
      JOIN events e ON e.id = es.event_id
      JOIN users u ON u.id = es.user_id
      LEFT JOIN event_staff_permissions esp ON esp.event_staff_id = es.id
      GROUP BY es.id, es.is_active, es.created_at, e.id, e.name, e.poster, e.event_date, u.id, u.name, u.email, u.phone
      ORDER BY e.event_date DESC, u.name ASC
    `);

    res.json({
      success: true,
      total: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get All Staff Assignments Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil semua data penugasan staff",
    });
  }
};

// ==========================================
// 6. ADMIN: TUGASKAN STAFF KE EVENT + PERMISSIONS
// ==========================================
const assignStaff = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      event_id,
      user_id,
      permissions = [],
      is_active = true,
    } = req.body;

    if (!event_id || !user_id) {
      return res.status(400).json({
        success: false,
        message: "Event ID dan User ID wajib diisi",
      });
    }

    // Validasi permission list jika ada
    if (permissions && !Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: "Permissions harus berupa array string",
      });
    }

    for (const p of permissions) {
      if (!VALID_PERMISSIONS.includes(p)) {
        return res.status(400).json({
          success: false,
          message: `Permission '${p}' tidak valid. Pilihan: ${VALID_PERMISSIONS.join(", ")}`,
        });
      }
    }

    // Cek event exists
    const eventRes = await client.query(
      "SELECT id, name FROM events WHERE id = $1",
      [event_id]
    );
    if (eventRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event tidak ditemukan",
      });
    }

    // Cek user exists dan role adalah 'petugas'
    const userRes = await client.query(
      "SELECT id, name, email, role FROM users WHERE id = $1",
      [user_id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    if (userRes.rows[0].role !== "petugas") {
      return res.status(400).json({
        success: false,
        message: "User yang ditugaskan harus memiliki role 'petugas'",
      });
    }

    // Cek apakah sudah ditugaskan sebelumnya
    const existingRes = await client.query(
      "SELECT id FROM event_staff WHERE event_id = $1 AND user_id = $2",
      [event_id, user_id]
    );

    if (existingRes.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Petugas ini sudah ditugaskan pada event tersebut",
      });
    }

    // Mulai transaksi database
    await client.query("BEGIN");

    // 1. Insert ke event_staff
    const staffRes = await client.query(
      `
      INSERT INTO event_staff
      (event_id, user_id, is_active)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [event_id, user_id, is_active !== false]
    );

    const eventStaff = staffRes.rows[0];

    // 2. Insert ke event_staff_permissions
    const grantedPermissions = [];
    const uniquePermissions = [...new Set(permissions)];

    for (const perm of uniquePermissions) {
      await client.query(
        `
        INSERT INTO event_staff_permissions
        (event_staff_id, permission)
        VALUES ($1, $2)
        ON CONFLICT (event_staff_id, permission) DO NOTHING
        `,
        [eventStaff.id, perm]
      );
      grantedPermissions.push(perm);
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Petugas berhasil ditugaskan ke event dengan hak akses yang ditentukan",
      data: {
        event_staff_id: eventStaff.id,
        event_id: eventStaff.event_id,
        event_name: eventRes.rows[0].name,
        user_id: userRes.rows[0].id,
        staff_name: userRes.rows[0].name,
        staff_email: userRes.rows[0].email,
        is_active: eventStaff.is_active,
        permissions: grantedPermissions,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Assign Staff Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menugaskan petugas ke event",
    });
  } finally {
    client.release();
  }
};

// ==========================================
// 7. ADMIN: UPDATE PERMISSIONS PETUGAS
// ==========================================
const updateStaffPermissions = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params; // ID dari event_staff
    const { permissions = [] } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: "Permissions harus berupa array",
      });
    }

    for (const p of permissions) {
      if (!VALID_PERMISSIONS.includes(p)) {
        return res.status(400).json({
          success: false,
          message: `Permission '${p}' tidak valid. Pilihan: ${VALID_PERMISSIONS.join(", ")}`,
        });
      }
    }

    // Pastikan event_staff ada
    const staffCheck = await client.query(
      `
      SELECT es.id, es.event_id, es.user_id, u.name as staff_name, e.name as event_name
      FROM event_staff es
      JOIN users u ON u.id = es.user_id
      JOIN events e ON e.id = es.event_id
      WHERE es.id = $1
      `,
      [id]
    );

    if (staffCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data penugasan staff tidak ditemukan",
      });
    }

    await client.query("BEGIN");

    // 1. Hapus permissions lama
    await client.query(
      "DELETE FROM event_staff_permissions WHERE event_staff_id = $1",
      [id]
    );

    // 2. Simpan permissions baru
    const uniquePermissions = [...new Set(permissions)];
    for (const perm of uniquePermissions) {
      await client.query(
        `
        INSERT INTO event_staff_permissions
        (event_staff_id, permission)
        VALUES ($1, $2)
        `,
        [id, perm]
      );
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Permission petugas berhasil diperbarui",
      data: {
        event_staff_id: Number(id),
        staff_name: staffCheck.rows[0].staff_name,
        event_name: staffCheck.rows[0].event_name,
        permissions: uniquePermissions,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update Staff Permissions Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui permission petugas",
    });
  } finally {
    client.release();
  }
};

// ==========================================
// 8. ADMIN: TOGGLE / UPDATE STATUS AKTIF PETUGAS
// ==========================================
const toggleStaffStatus = async (req, res) => {
  try {
    const { id } = req.params; // ID dari event_staff
    const { is_active } = req.body;

    let updateQuery;
    let queryParams;

    if (typeof is_active === "boolean") {
      updateQuery = `
        UPDATE event_staff
        SET is_active = $1
        WHERE id = $2
        RETURNING id, event_id, user_id, is_active
      `;
      queryParams = [is_active, id];
    } else {
      updateQuery = `
        UPDATE event_staff
        SET is_active = NOT is_active
        WHERE id = $1
        RETURNING id, event_id, user_id, is_active
      `;
      queryParams = [id];
    }

    const result = await pool.query(updateQuery, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data penugasan staff tidak ditemukan",
      });
    }

    const updated = result.rows[0];

    res.json({
      success: true,
      message: `Status petugas berhasil diubah menjadi ${updated.is_active ? "Aktif" : "Nonaktif"}`,
      data: updated,
    });
  } catch (error) {
    console.error("Toggle Staff Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengubah status aktif petugas",
    });
  }
};

// ==========================================
// 9. ADMIN: HAPUS PENUGASAN STAFF DARI EVENT
// ==========================================
// Hapus via event_staff.id
const removeStaffById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM event_staff
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data penugasan staff tidak ditemukan",
      });
    }

    res.json({
      success: true,
      message: "Penugasan petugas berhasil dihapus dari event",
    });
  } catch (error) {
    console.error("Remove Staff By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus penugasan petugas",
    });
  }
};

// Hapus via eventId & userId (backward compatible)
const removeStaff = async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    const result = await pool.query(
      `
      DELETE FROM event_staff
      WHERE event_id = $1 AND user_id = $2
      RETURNING *
      `,
      [eventId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Staff tidak ditemukan pada event",
      });
    }

    res.json({
      success: true,
      message: "Staff berhasil dihapus dari event",
    });
  } catch (error) {
    console.error("Remove Staff Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus staff dari event",
    });
  }
};

module.exports = {
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
};
