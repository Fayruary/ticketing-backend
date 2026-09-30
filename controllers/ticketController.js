const pool = require("../config/db");

// ===============================
// TICKET CATEGORY
// ===============================

const getCategoriesByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM ticket_categories
      WHERE event_id = $1
      ORDER BY price ASC
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
      message: "Gagal mengambil kategori tiket"
    });
  }
};

const createTicketCategory = async (req, res) => {
  try {
    const {
      event_id,
      name,
      price,
      stock
    } = req.body;

    if (!event_id || !name || price === undefined || stock === undefined) {
      return res.status(400).json({
        success: false,
        message: "Event, nama, harga, dan stock wajib diisi"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO ticket_categories
      (event_id, name, price, stock)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [event_id, name, price, stock]
    );

    res.status(201).json({
      success: true,
      message: "Kategori tiket berhasil dibuat",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal membuat kategori tiket"
    });
  }
};

const updateTicketCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, stock } = req.body;

    const result = await pool.query(
      `
      UPDATE ticket_categories
      SET
        name = COALESCE($1, name),
        price = COALESCE($2, price),
        stock = COALESCE($3, stock)
      WHERE id = $4
      RETURNING *
      `,
      [name, price, stock, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kategori tiket tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Kategori tiket berhasil diperbarui",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui kategori tiket"
    });
  }
};

const deleteTicketCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM ticket_categories
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kategori tiket tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Kategori tiket berhasil dihapus"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus kategori tiket"
    });
  }
};

// ===============================
// TICKETS
// ===============================

// Tiket milik user
const getMyTickets = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        t.id,
        t.ticket_code,
        t.qr_code,
        t.status,
        o.invoice_code,
        e.id AS event_id,
        e.name AS event_name,
        e.poster,
        e.city,
        e.venue,
        e.event_date,
        e.event_time,
        tc.name AS ticket_category,
        od.quantity,
        od.price
      FROM tickets t
      JOIN order_details od
        ON od.id = t.order_detail_id
      JOIN orders o
        ON o.id = od.order_id
      JOIN ticket_categories tc
        ON tc.id = od.ticket_category_id
      JOIN events e
        ON e.id = tc.event_id
      WHERE o.user_id = $1
      ORDER BY e.event_date ASC
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
      message: "Gagal mengambil tiket"
    });
  }
};

// Cari tiket berdasarkan kode
const getTicketByCode = async (req, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      `
      SELECT
        t.*,
        e.name AS event_name,
        e.event_date,
        e.event_time,
        e.venue,
        tc.name AS ticket_category,
        u.name AS buyer_name,
        u.email AS buyer_email
      FROM tickets t
      JOIN order_details od
        ON od.id = t.order_detail_id
      JOIN orders o
        ON o.id = od.order_id
      JOIN ticket_categories tc
        ON tc.id = od.ticket_category_id
      JOIN events e
        ON e.id = tc.event_id
      JOIN users u
        ON u.id = o.user_id
      WHERE t.ticket_code = $1
      `,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tiket tidak ditemukan"
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
      message: "Gagal mencari tiket"
    });
  }
};

// GET Kategori tiket berdasarkan ID
const getTicketCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM ticket_categories
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kategori tiket tidak ditemukan"
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
      message: "Gagal mengambil kategori tiket"
    });
  }
};

module.exports = {
  getCategoriesByEvent,
  getTicketCategoryById,
  createTicketCategory,
  updateTicketCategory,
  deleteTicketCategory,
  getMyTickets,
  getTicketByCode
};