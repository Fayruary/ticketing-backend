const pool = require("../config/db");
const { verifyStaffPermission } = require("../middleware/permission");

// ==========================================
// 1. CHECK-IN TIKET (SCAN BARCODE / QR CODE)
// ==========================================
const checkinTicket = async (req, res) => {
  const client = await pool.connect();

  try {
    const staffId = req.user.id;
    const { ticket_code } = req.body;

    if (!ticket_code || !ticket_code.trim()) {
      return res.status(400).json({
        success: false,
        message: "Kode tiket wajib diisi untuk melakukan check-in",
      });
    }

    await client.query("BEGIN");

    // 1. Ambil dan kunci data tiket beserta informasi event
    const ticketResult = await client.query(
      `
      SELECT
        t.id,
        t.ticket_code,
        t.status,
        t.owner_name,
        t.owner_email,
        COALESCE(tc.event_id, o.event_id) AS event_id,
        COALESCE(e.name, 'Konser Musik') AS event_name,
        e.event_date,
        e.event_time,
        COALESCE(tc.name, 'General Pass') AS ticket_category
      FROM tickets t
      LEFT JOIN order_details od ON od.id = t.order_detail_id
      LEFT JOIN ticket_categories tc ON tc.id = od.ticket_category_id
      LEFT JOIN orders o ON o.id = t.order_id OR o.id = od.order_id
      LEFT JOIN events e ON e.id = tc.event_id OR e.id = o.event_id
      WHERE t.ticket_code = $1
      FOR UPDATE OF t
      `,
      [ticket_code.trim()]
    );

    if (ticketResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Tiket tidak ditemukan dalam sistem",
      });
    }

    const ticket = ticketResult.rows[0];

    // 2. Pastikan tiket belum pernah digunakan (mencegah double check-in)
    if (ticket.status === "used") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Tiket sudah digunakan sebelumnya untuk masuk ke venue",
        data: {
          ticket_code: ticket.ticket_code,
          event_name: ticket.event_name,
          status: "used",
        },
      });
    }

    if (!ticket.event_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Data event untuk tiket ini tidak valid",
      });
    }

    // 3. Validasi penugasan aktif dan permission 'checkin' petugas pada event tersebut
    const permCheck = await verifyStaffPermission(
      client,
      staffId,
      ticket.event_id,
      "checkin",
      req.user.role
    );

    if (!permCheck.allowed) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: permCheck.reason || "Anda tidak memiliki izin check-in untuk event ini",
      });
    }

    // 4. Ubah status tiket menjadi 'used'
    await client.query(
      `
      UPDATE tickets
      SET status = 'used'
      WHERE id = $1
      `,
      [ticket.id]
    );

    // 5. Catat riwayat check-in ke tabel checkins
    const checkinResult = await client.query(
      `
      INSERT INTO checkins
      (ticket_id, staff_id, checkin_time)
      VALUES ($1, $2, NOW())
      RETURNING id, ticket_id, staff_id, checkin_time
      `,
      [ticket.id, staffId]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Check-in berhasil! Pengunjung diizinkan masuk venue.",
      data: {
        ticket: {
          id: ticket.id,
          ticket_code: ticket.ticket_code,
          status: "used",
          owner_name: ticket.owner_name,
          ticket_category: ticket.ticket_category,
          event_name: ticket.event_name,
          event_date: ticket.event_date,
        },
        checkin: checkinResult.rows[0],
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Checkin Ticket Error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat memproses check-in tiket",
    });
  } finally {
    client.release();
  }
};

// ==========================================
// 2. RIWAYAT PENGUNJUNG / CHECK-IN EVENT
// ==========================================
const getEventCheckins = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID wajib disertakan",
      });
    }

    // Validasi permission 'view_visitors' jika bukan admin
    if (req.user.role !== "admin") {
      const permCheck = await verifyStaffPermission(
        pool,
        req.user.id,
        eventId,
        "view_visitors",
        req.user.role
      );

      if (!permCheck.allowed) {
        return res.status(403).json({
          success: false,
          message: permCheck.reason || "Anda tidak memiliki izin 'view_visitors' untuk melihat daftar pengunjung event ini",
        });
      }
    }

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.checkin_time,
        t.ticket_code,
        COALESCE(t.owner_name, 'Pengunjung') AS visitor_name,
        COALESCE(t.owner_email, '') AS visitor_email,
        COALESCE(tc.name, 'General Pass') AS ticket_category,
        u.name AS staff_name
      FROM checkins c
      JOIN tickets t ON t.id = c.ticket_id
      LEFT JOIN order_details od ON od.id = t.order_detail_id
      LEFT JOIN ticket_categories tc ON tc.id = od.ticket_category_id
      LEFT JOIN orders o ON o.id = t.order_id OR o.id = od.order_id
      JOIN users u ON u.id = c.staff_id
      WHERE (tc.event_id = $1 OR o.event_id = $1)
      ORDER BY c.checkin_time DESC
      `,
      [eventId]
    );

    res.json({
      success: true,
      total: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Event Checkins Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data riwayat check-in pengunjung",
    });
  }
};

module.exports = {
  checkinTicket,
  getEventCheckins,
};
