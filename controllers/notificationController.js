const pool = require("../config/db");

// Notification milik user
const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT *
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal mengambil notification"
    });
  }
};

// CREATE notification
const createNotification = async (req, res) => {
  try {
    const {
      user_id,
      title,
      message
    } = req.body;

    if (!user_id || !title || !message) {
      return res.status(400).json({
        success: false,
        message: "User, title, dan message wajib diisi"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO notifications
      (user_id, title, message)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [
        user_id,
        title,
        message
      ]
    );

    res.status(201).json({
      success: true,
      message: "Notification berhasil dibuat",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal membuat notification"
    });
  }
};

// Tandai notification sudah dibaca
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE notifications
      SET is_read = true
      WHERE id = $1
      AND user_id = $2
      RETURNING *
      `,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Notification ditandai sudah dibaca",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal memperbarui notification"
    });
  }
};

// Tandai semua sudah dibaca
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await pool.query(
      `
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1
      `,
      [userId]
    );

    res.json({
      success: true,
      message: "Semua notification sudah dibaca"
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal memperbarui notification"
    });
  }
};

// DELETE
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM notifications
      WHERE id = $1
      AND user_id = $2
      RETURNING id
      `,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Notification berhasil dihapus"
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal menghapus notification"
    });
  }
};

module.exports = {
  getMyNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification
};