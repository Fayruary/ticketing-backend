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
        COALESCE(t.owner_name, o.buyer_name) AS owner_name,
        COALESCE(t.owner_email, o.buyer_email) AS owner_email,
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

// Helper untuk mengekstrak kode tiket bersih (jika scanner mengirimkan raw code atau JSON string QR)
const extractCleanTicketCode = (input) => {
  if (!input) return "";
  let str = String(input).trim();
  if (str.startsWith("{") && str.endsWith("}")) {
    try {
      const parsed = JSON.parse(str);
      if (parsed.code) return String(parsed.code).trim().toUpperCase();
      if (parsed.ticket_code) return String(parsed.ticket_code).trim().toUpperCase();
    } catch {
      // bukan JSON murni, lanjutkan sebagai string biasa
    }
  }
  return str.toUpperCase();
};

// Cari & Validasi tiket berdasarkan kode tiket
const getTicketByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const cleanCode = extractCleanTicketCode(code);

    if (!cleanCode) {
      return res.status(400).json({
        success: false,
        message: "Kode tiket tidak boleh kosong",
      });
    }

    const result = await pool.query(
      `
      SELECT
        t.id,
        t.ticket_code,
        t.status,
        COALESCE(t.owner_name, o.buyer_name, u.name, 'Pengunjung') AS owner_name,
        COALESCE(t.owner_email, o.buyer_email, u.email, '') AS owner_email,
        COALESCE(t.owner_phone, o.buyer_phone, u.phone, '') AS owner_phone,
        t.created_at,
        t.qr_code,
        COALESCE(tc.event_id, o.event_id, e.id) AS event_id,
        COALESCE(e.name, 'Konser Musik') AS event_name,
        e.poster AS event_poster,
        e.event_date,
        e.event_time,
        e.venue,
        e.city,
        COALESCE(tc.name, 'General Pass') AS ticket_category,
        COALESCE(tc.price, od.price, 0) AS ticket_price,
        o.invoice_code,
        o.payment_status,
        c.checkin_time,
        staff.name AS checked_in_by_staff
      FROM tickets t
      LEFT JOIN order_details od ON od.id = t.order_detail_id
      LEFT JOIN ticket_categories tc ON tc.id = od.ticket_category_id
      LEFT JOIN orders o ON o.id = t.order_id OR o.id = od.order_id
      LEFT JOIN events e ON e.id = tc.event_id OR e.id = o.event_id
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN checkins c ON c.ticket_id = t.id
      LEFT JOIN users staff ON staff.id = c.staff_id
      WHERE UPPER(TRIM(t.ticket_code)) = UPPER(TRIM($1))
      ORDER BY c.checkin_time DESC NULLS LAST
      LIMIT 1
      `,
      [cleanCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Tiket dengan kode "${cleanCode}" tidak ditemukan dalam sistem.`,
      });
    }

    const row = result.rows[0];
    const isValid = row.status === "active";

    let statusLabel = "Tidak Valid";
    if (row.status === "active") {
      statusLabel = "Valid (Belum Digunakan)";
    } else if (row.status === "used") {
      statusLabel = "Sudah Digunakan (Telah Masuk)";
    } else if (row.status === "expired") {
      statusLabel = "Kadaluarsa";
    } else if (row.status === "cancelled") {
      statusLabel = "Dibatalkan";
    }

    res.json({
      success: true,
      data: {
        ...row,
        is_valid: isValid,
        status_label: statusLabel,
      },
    });
  } catch (error) {
    console.error("getTicketByCode Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal memvalidasi kode tiket",
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