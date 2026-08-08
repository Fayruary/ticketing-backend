const pool = require("../config/db");

// GET staff berdasarkan event
const getEventStaff = async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await pool.query(
      `
      SELECT
        es.id,
        es.event_id,
        u.id AS user_id,
        u.name,
        u.email,
        u.phone,
        u.role
      FROM event_staff es
      JOIN users u
        ON u.id = es.user_id
      WHERE es.event_id = $1
      ORDER BY u.name ASC
      `,
      [eventId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal mengambil staff event"
    });
  }
};

// Assign staff
const assignStaff = async (req, res) => {
  try {
    const {
      event_id,
      user_id
    } = req.body;

    if (!event_id || !user_id) {
      return res.status(400).json({
        success: false,
        message: "Event ID dan user ID wajib diisi"
      });
    }

    const userResult = await pool.query(
      `
      SELECT id, name, role
      FROM users
      WHERE id = $1
      `,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan"
      });
    }

    if (userResult.rows[0].role !== "petugas") {
      return res.status(400).json({
        success: false,
        message: "User tersebut bukan petugas"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO event_staff
      (event_id, user_id)
      VALUES ($1, $2)
      RETURNING *
      `,
      [event_id, user_id]
    );

    res.status(201).json({
      success: true,
      message: "Staff berhasil ditugaskan",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Staff sudah ditugaskan pada event ini"
      });
    }

    res.status(500).json({
      success: false,
      message: "Gagal menugaskan staff"
    });
  }
};

// Remove staff
const removeStaff = async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    const result = await pool.query(
      `
      DELETE FROM event_staff
      WHERE event_id = $1
      AND user_id = $2
      RETURNING *
      `,
      [eventId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Staff tidak ditemukan pada event"
      });
    }

    res.json({
      success: true,
      message: "Staff berhasil dihapus dari event"
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal menghapus staff"
    });
  }
};

module.exports = {
  getEventStaff,
  assignStaff,
  removeStaff
};