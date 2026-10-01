const pool = require("../config/db");

// ---------- Helpers ----------

// "" / undefined / null -> null, "1.000" -> 1000, angka tidak valid -> NaN
const toIntOrNull = (v) => {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(String(v).replace(/\./g, ""));
  return Number.isInteger(n) ? n : NaN;
};

// "" / undefined -> null (biar COALESCE di UPDATE tidak menimpa data lama dengan string kosong)
const emptyToNull = (v) => (v === "" || v === undefined ? null : v);

// GET semua event (mendukung query filter: city, search, genre, status)
const getAllEvents = async (req, res) => {
  try {
    const { city, genre, search, status } = req.query;

    let query = `
      SELECT
        e.*,
        o.name AS organizer_name,
        o.company_name,
        COALESCE(MIN(tc.price), 0)::numeric AS min_price
      FROM events e
      LEFT JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN ticket_categories tc ON tc.event_id = e.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (city && city !== "Semua Kota") {
      query += ` AND LOWER(e.city) LIKE LOWER($${paramIndex})`;
      params.push(`%${city}%`);
      paramIndex++;
    }

    if (search && search.trim() !== "") {
      query += ` AND (LOWER(e.name) LIKE LOWER($${paramIndex}) OR LOWER(e.venue) LIKE LOWER($${paramIndex}) OR LOWER(e.description) LIKE LOWER($${paramIndex}))`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (genre && genre !== "Semua") {
      query += ` AND LOWER(e.description) LIKE LOWER($${paramIndex})`;
      params.push(`%${genre}%`);
      paramIndex++;
    }

    if (status) {
      query += ` AND e.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += `
      GROUP BY e.id, o.name, o.company_name
      ORDER BY e.created_at DESC
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error("Get all events error:", error);
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

    const capacityInt = toIntOrNull(capacity);
    const organizerInt = toIntOrNull(organizer_id);

    if (Number.isNaN(capacityInt) || (capacityInt !== null && capacityInt < 0)) {
      return res.status(400).json({
        success: false,
        message: "Kapasitas harus berupa angka bulat"
      });
    }

    if (Number.isNaN(organizerInt)) {
      return res.status(400).json({
        success: false,
        message: "Organizer tidak valid"
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
        organizerInt,
        name,
        description || null,
        poster || null,
        city || null,
        venue || null,
        capacityInt,
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

    const capacityInt = toIntOrNull(capacity);
    const organizerInt = toIntOrNull(organizer_id);

    if (Number.isNaN(capacityInt) || (capacityInt !== null && capacityInt < 0)) {
      return res.status(400).json({
        success: false,
        message: "Kapasitas harus berupa angka bulat"
      });
    }

    if (Number.isNaN(organizerInt)) {
      return res.status(400).json({
        success: false,
        message: "Organizer tidak valid"
      });
    }

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
        organizerInt,
        emptyToNull(name),
        emptyToNull(description),
        emptyToNull(poster),
        emptyToNull(city),
        emptyToNull(venue),
        capacityInt,
        emptyToNull(event_date),
        emptyToNull(event_time),
        emptyToNull(status),
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