const pool = require("../config/db");

// GET semua event
const getAllEvents = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.*,
        o.name AS organizer_name,
        o.company_name
      FROM events e
      LEFT JOIN organizers o ON o.id = e.organizer_id
      ORDER BY e.created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil event"
    });
  }
};

// GET event berdasarkan ID
const getEventById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        e.*,
        o.name AS organizer_name,
        o.company_name,
        o.email AS organizer_email,
        o.phone AS organizer_phone
      FROM events e
      LEFT JOIN organizers o ON o.id = e.organizer_id
      WHERE e.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event tidak ditemukan"
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil event"
    });
  }
};

// CREATE event
const createEvent = async (req, res) => {
  try {
    const {
      organizer_id,
      name,
      description,
      poster,
      city,
      venue,
      capacity,
      event_date,
      event_time,
      status
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama event wajib diisi"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO events
      (
        organizer_id,
        name,
        description,
        poster,
        city,
        venue,
        capacity,
        event_date,
        event_time,
        status
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        organizer_id || null,
        name,
        description || null,
        poster || null,
        city || null,
        venue || null,
        capacity || null,
        event_date || null,
        event_time || null,
        status || "draft"
      ]
    );

    res.status(201).json({
      success: true,
      message: "Event berhasil dibuat",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal membuat event"
    });
  }
};

// UPDATE event
const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      organizer_id,
      name,
      description,
      poster,
      city,
      venue,
      capacity,
      event_date,
      event_time,
      status
    } = req.body;

    const result = await pool.query(
      `
      UPDATE events
      SET
        organizer_id = COALESCE($1, organizer_id),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        poster = COALESCE($4, poster),
        city = COALESCE($5, city),
        venue = COALESCE($6, venue),
        capacity = COALESCE($7, capacity),
        event_date = COALESCE($8, event_date),
        event_time = COALESCE($9, event_time),
        status = COALESCE($10, status),
        updated_at = now()
      WHERE id = $11
      RETURNING *
      `,
      [
        organizer_id,
        name,
        description,
        poster,
        city,
        venue,
        capacity,
        event_date,
        event_time,
        status,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Event berhasil diperbarui",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui event"
    });
  }
};

// DELETE event
const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM events WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Event berhasil dihapus"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus event"
    });
  }
};

// Publish event
const publishEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE events
      SET status = 'published',
          updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Event berhasil dipublish",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal publish event"
    });
  }
};

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  publishEvent
};