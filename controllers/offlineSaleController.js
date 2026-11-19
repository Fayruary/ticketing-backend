const crypto = require("crypto");
const pool = require("../config/db");
const { verifyStaffPermission } = require("../middleware/permission");

const generateTicketCode = () => {
  return `TKT-OTS-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

// ==========================================
// 1. BUAT PENJUALAN OFFLINE (OTS / LOKET)
// ==========================================
const createOfflineSale = async (req, res) => {
  const client = await pool.connect();

  try {
    const staffId = req.user.id;
    const {
      event_id,
      buyer_name,
      phone,
      buyer_email,
      payment_method = "cash",
      payment_status = "settlement",
      ticket_category_id,
      quantity,
    } = req.body;

    // 1. Validasi kelengkapan data
    if (!event_id || !buyer_name || !buyer_name.trim() || !ticket_category_id || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Data penjualan offline tidak lengkap atau jumlah tiket tidak valid",
      });
    }

    // 2. Validasi penugasan aktif dan permission 'offline_sales' petugas pada event tersebut
    const permCheck = await verifyStaffPermission(
      client,
      staffId,
      event_id,
      "offline_sales",
      req.user.role
    );

    if (!permCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: permCheck.reason || "Anda tidak memiliki izin penjualan tiket offline untuk event ini",
      });
    }

    await client.query("BEGIN");

    // 3. Kunci row kategori tiket dan cek ketersediaan stok
    const catResult = await client.query(
      `
      SELECT *
      FROM ticket_categories
      WHERE id = $1 AND event_id = $2
      FOR UPDATE
      `,
      [ticket_category_id, event_id]
    );

    if (catResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Kategori tiket untuk event ini tidak ditemukan",
      });
    }

    const category = catResult.rows[0];

    if (category.stock < quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `Stok tiket ${category.name} tidak mencukupi (Tersisa: ${category.stock} tiket)`,
      });
    }

    const total = Number(category.price) * Number(quantity);

    // 4. Kurangi stok kategori tiket secara konsisten
    await client.query(
      `
      UPDATE ticket_categories
      SET stock = stock - $1
      WHERE id = $2
      `,
      [quantity, ticket_category_id]
    );

    // 5. Masukkan ke tabel offline_sales dengan kolom lengkap
    const saleResult = await client.query(
      `
      INSERT INTO offline_sales
      (event_id, staff_id, buyer_name, phone, buyer_email, payment_method, payment_status, ticket_category_id, quantity, total)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
      `,
      [
        event_id,
        staffId,
        buyer_name.trim(),
        phone ? phone.trim() : null,
        buyer_email ? buyer_email.trim().toLowerCase() : null,
        payment_method || "cash",
        payment_status || "settlement",
        ticket_category_id,
        quantity,
        total,
      ]
    );

    const sale = saleResult.rows[0];

    // 6. Terbitkan tiket offline dan catat check-in langsung
    const issuedTickets = [];
    for (let i = 0; i < quantity; i++) {
      const ticketCode = generateTicketCode();
      const ticketRes = await client.query(
        `
        INSERT INTO tickets
        (ticket_code, qr_code, status, owner_name, owner_email, owner_phone)
        VALUES ($1, $2, 'used', $3, $4, $5)
        RETURNING *
        `,
        [
          ticketCode,
          ticketCode,
          buyer_name.trim(),
          buyer_email ? buyer_email.trim().toLowerCase() : null,
          phone ? phone.trim() : null,
        ]
      );

      // Catat juga ke checkins agar pengunjung terdata langsung masuk venue
      await client.query(
        `
        INSERT INTO checkins
        (ticket_id, staff_id, checkin_time)
        VALUES ($1, $2, NOW())
        `,
        [ticketRes.rows[0].id, staffId]
      );

      issuedTickets.push(ticketRes.rows[0]);
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Penjualan tiket offline berhasil diproses",
      data: {
        sale: {
          ...sale,
          category_name: category.name,
          unit_price: category.price,
        },
        tickets: issuedTickets,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create Offline Sale Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Gagal memproses transaksi penjualan offline",
    });
  } finally {
    client.release();
  }
};

// ==========================================
// 2. LIHAT SEMUA PENJUALAN OFFLINE
// ==========================================
const getOfflineSales = async (req, res) => {
  try {
    let result;

    if (req.user.role === "admin") {
      result = await pool.query(`
        SELECT
          os.*,
          e.name AS event_name,
          tc.name AS ticket_category_name,
          tc.price AS ticket_price,
          u.name AS staff_name
        FROM offline_sales os
        LEFT JOIN events e ON e.id = os.event_id
        LEFT JOIN ticket_categories tc ON tc.id = os.ticket_category_id
        LEFT JOIN users u ON u.id = os.staff_id
        ORDER BY os.created_at DESC
      `);
    } else {
      // Petugas hanya melihat penjualan offline pada event yang aktif ditugaskan kepadanya dengan izin offline_sales atau view_reports
      result = await pool.query(
        `
        SELECT
          os.*,
          e.name AS event_name,
          tc.name AS ticket_category_name,
          tc.price AS ticket_price,
          u.name AS staff_name
        FROM offline_sales os
        JOIN event_staff es ON es.event_id = os.event_id AND es.user_id = $1 AND es.is_active = true
        JOIN event_staff_permissions esp ON esp.event_staff_id = es.id AND esp.permission IN ('offline_sales', 'view_reports')
        LEFT JOIN events e ON e.id = os.event_id
        LEFT JOIN ticket_categories tc ON tc.id = os.ticket_category_id
        LEFT JOIN users u ON u.id = os.staff_id
        GROUP BY os.id, e.name, tc.name, tc.price, u.name
        ORDER BY os.created_at DESC
        `,
        [req.user.id]
      );
    }

    res.json({
      success: true,
      total: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Offline Sales Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data penjualan offline",
    });
  }
};

// ==========================================
// 3. LIHAT PENJUALAN OFFLINE PER EVENT
// ==========================================
const getEventOfflineSales = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID wajib disertakan",
      });
    }

    // Validasi permission jika bukan admin (harus memiliki view_reports atau offline_sales pada event tersebut)
    if (req.user.role !== "admin") {
      const reportCheck = await verifyStaffPermission(
        pool,
        req.user.id,
        eventId,
        "view_reports",
        req.user.role
      );

      if (!reportCheck.allowed) {
        const offlineCheck = await verifyStaffPermission(
          pool,
          req.user.id,
          eventId,
          "offline_sales",
          req.user.role
        );

        if (!offlineCheck.allowed) {
          return res.status(403).json({
            success: false,
            message: "Anda tidak memiliki izin untuk melihat laporan penjualan offline event ini",
          });
        }
      }
    }

    const result = await pool.query(
      `
      SELECT
        os.*,
        tc.name AS ticket_category_name,
        tc.price AS ticket_price,
        u.name AS staff_name
      FROM offline_sales os
      LEFT JOIN ticket_categories tc ON tc.id = os.ticket_category_id
      LEFT JOIN users u ON u.id = os.staff_id
      WHERE os.event_id = $1
      ORDER BY os.created_at DESC
      `,
      [eventId]
    );

    res.json({
      success: true,
      total: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Event Offline Sales Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data penjualan offline event",
    });
  }
};

module.exports = {
  createOfflineSale,
  getOfflineSales,
  getEventOfflineSales,
};
