const crypto = require("crypto");
const pool = require("../config/db");

const generateTicketCode = () => {
  return `TKT-OTS-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

// CREATE OFFLINE SALE
const createOfflineSale = async (req, res) => {
  const client = await pool.connect();

  try {
    const staffId = req.user.id;
    const {
      event_id,
      buyer_name,
      phone,
      ticket_category_id,
      quantity
    } = req.body;

    if (!event_id || !buyer_name || !ticket_category_id || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Data penjualan offline tidak lengkap atau jumlah tidak valid"
      });
    }

    await client.query("BEGIN");

    // 1. Cek ketersediaan kategori tiket dan stok
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
        message: "Kategori tiket untuk event ini tidak ditemukan"
      });
    }

    const category = catResult.rows[0];

    if (category.stock < quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `Stok tiket ${category.name} tidak mencukupi (Tersisa: ${category.stock})`
      });
    }

    const total = Number(category.price) * Number(quantity);

    // 2. Kurangi stok kategori tiket
    await client.query(
      `
      UPDATE ticket_categories
      SET stock = stock - $1
      WHERE id = $2
      `,
      [quantity, ticket_category_id]
    );

    // 3. Masukkan ke tabel offline_sales
    const saleResult = await client.query(
      `
      INSERT INTO offline_sales
      (event_id, staff_id, buyer_name, phone, ticket_category_id, quantity, total)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        event_id,
        staffId,
        buyer_name,
        phone || null,
        ticket_category_id,
        quantity,
        total
      ]
    );

    const sale = saleResult.rows[0];

    // 4. Terbitkan tiket offline langsung
    const issuedTickets = [];
    for (let i = 0; i < quantity; i++) {
      const ticketCode = generateTicketCode();
      const ticketRes = await client.query(
        `
        INSERT INTO tickets
        (ticket_code, qr_code, status)
        VALUES ($1, $2, 'used')
        RETURNING *
        `,
        [ticketCode, ticketCode]
      );

      // Catat juga ke checkins agar tercatat penonton sudah masuk
      await client.query(
        `
        INSERT INTO checkins
        (ticket_id, staff_id)
        VALUES ($1, $2)
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
        sale,
        tickets: issuedTickets
      }
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Offline sale error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Gagal memproses penjualan offline"
    });
  } finally {
    client.release();
  }
};

// GET ALL OFFLINE SALES
const getOfflineSales = async (req, res) => {
  try {
    const result = await pool.query(`
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

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error("Get offline sales error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data penjualan offline"
    });
  }
};

// GET EVENT OFFLINE SALES
const getEventOfflineSales = async (req, res) => {
  try {
    const { eventId } = req.params;

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
      data: result.rows
    });
  } catch (error) {
    console.error("Get event offline sales error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data penjualan offline event"
    });
  }
};

module.exports = {
  createOfflineSale,
  getOfflineSales,
  getEventOfflineSales
};
