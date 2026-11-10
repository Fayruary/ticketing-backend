const crypto = require("crypto");
const QRCode = require("qrcode");
const pool = require("../config/db");
const { snap, clientKey } = require("../config/midtrans");

const isUUID = (str) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str || ""));

const generateInvoice = () => {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `INV-${Date.now()}-${random}`;
};

// Helper: generate tickets for paid order
const generateTicketsForOrder = async (client, orderId) => {
  // Check if order already has tickets
  const existingTickets = await client.query(
    `SELECT * FROM tickets WHERE order_id = $1`,
    [orderId]
  );
  if (existingTickets.rows.length > 0) {
    return existingTickets.rows;
  }

  // Fetch order details with category and event info
  const orderRes = await client.query(
    `SELECT o.*, e.name as event_name, e.id as event_id, e.venue, e.event_date, e.event_time
     FROM orders o
     LEFT JOIN events e ON e.id = o.event_id
     WHERE o.id = $1`,
    [orderId]
  );
  if (orderRes.rows.length === 0) return [];
  const order = orderRes.rows[0];

  const detailsRes = await client.query(
    `SELECT od.*, tc.name as category_name, COALESCE(tc.tickets_per_package, 1) as bundle_size
     FROM order_details od
     JOIN ticket_categories tc ON tc.id = od.ticket_category_id
     WHERE od.order_id = $1`,
    [orderId]
  );

  const ticketHolders = Array.isArray(order.ticket_holders) ? order.ticket_holders : [];
  let holderIndex = 0;
  const createdTickets = [];

  for (const detail of detailsRes.rows) {
    const bundleSize = detail.bundle_size || 1;
    const totalPhysicalTickets = detail.quantity * bundleSize;

    for (let i = 0; i < totalPhysicalTickets; i++) {
      const randomCode = crypto.randomBytes(3).toString("hex").toUpperCase();
      const datePart = new Date().toISOString().slice(2, 7).replace("-", "");
      const ticketCode = `TIX-${datePart}-${randomCode}`;

      const holder = ticketHolders[holderIndex] || {};
      const ownerName = holder.name || order.buyer_name || "Pemegang Tiket";
      const ownerEmail = holder.email || order.buyer_email || "";
      const ownerPhone = holder.phone || order.buyer_phone || "";
      holderIndex++;

      // QR Code payload
      const qrPayload = JSON.stringify({
        code: ticketCode,
        invoice: order.invoice_code,
        event: order.event_name,
        name: ownerName
      });

      const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: "M",
        width: 320,
        margin: 1
      });

      const insertRes = await client.query(
        `INSERT INTO tickets
         (order_id, order_detail_id, ticket_code, qr_code, owner_name, owner_email, owner_phone, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
         RETURNING *`,
        [
          orderId,
          detail.id,
          ticketCode,
          qrCodeDataUrl,
          ownerName,
          ownerEmail,
          ownerPhone
        ]
      );
      createdTickets.push(insertRes.rows[0]);
    }
  }

  return createdTickets;
};

// ==========================================
// 1. CREATE CHECKOUT ORDER (Multi-Step Artatix)
// ==========================================
const createCheckoutOrder = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user?.id || null;
    const {
      event_id,
      buyer_name,
      buyer_email,
      buyer_phone,
      items,
      ticket_holders = []
    } = req.body;

    // Validasi dasar
    if (!event_id) {
      return res.status(400).json({ success: false, message: "Event ID wajib diisi" });
    }
    if (!buyer_name || !buyer_email || !buyer_phone) {
      return res.status(400).json({
        success: false,
        message: "Data pemesan (Nama, Email, WhatsApp) wajib diisi lengkap"
      });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Pilih minimal 1 kategori tiket" });
    }

    // Ambil data event
    const eventRes = await client.query(`SELECT * FROM events WHERE id = $1`, [event_id]);
    if (eventRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Event tidak ditemukan" });
    }
    const eventData = eventRes.rows[0];

    await client.query("BEGIN");

    let subtotal = 0;
    const processedItems = [];

    // Validasi stok dan kalkulasi harga secara atomik
    for (const item of items) {
      const { ticket_category_id, quantity } = item;
      const qty = parseInt(quantity, 10);

      if (!ticket_category_id || isNaN(qty) || qty <= 0) {
        throw new Error("Item tiket tidak valid");
      }

      const catRes = await client.query(
        `SELECT * FROM ticket_categories WHERE id = $1 FOR UPDATE`,
        [ticket_category_id]
      );

      if (catRes.rows.length === 0) {
        throw new Error("Kategori tiket tidak ditemukan");
      }

      const cat = catRes.rows[0];

      if (cat.stock < qty) {
        throw new Error(`Stok kategori tiket "${cat.name}" tersisa ${cat.stock}, tidak mencukupi`);
      }

      const maxAllowed = cat.max_per_transaction || 5;
      if (qty > maxAllowed) {
        throw new Error(`Maksimal pembelian untuk "${cat.name}" adalah ${maxAllowed} tiket per pesanan`);
      }

      const itemSubtotal = Number(cat.price) * qty;
      subtotal += itemSubtotal;

      processedItems.push({
        ticket_category_id,
        category_name: cat.name,
        quantity: qty,
        tickets_per_package: cat.tickets_per_package || 1,
        price: cat.price,
        subtotal: itemSubtotal
      });

      // Kurangi stok
      await client.query(
        `UPDATE ticket_categories SET stock = stock - $1 WHERE id = $2`,
        [qty, ticket_category_id]
      );
    }

    const adminFee = 5000; // Biaya layanan platform
    const totalAmount = subtotal + adminFee;
    const invoiceCode = generateInvoice();

    // Simpan order
    const orderInsert = await client.query(
      `INSERT INTO orders
       (user_id, event_id, invoice_code, buyer_name, buyer_email, buyer_phone, subtotal, admin_fee, total, status, payment_status, ticket_holders, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'pending', $10, NOW())
       RETURNING *`,
      [
        userId,
        event_id,
        invoiceCode,
        buyer_name,
        buyer_email,
        buyer_phone,
        subtotal,
        adminFee,
        totalAmount,
        JSON.stringify(ticket_holders)
      ]
    );

    const order = orderInsert.rows[0];

    // Simpan order_details
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO order_details
         (order_id, ticket_category_id, quantity, ticket_quantity, price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          order.id,
          item.ticket_category_id,
          item.quantity,
          item.quantity * item.tickets_per_package,
          item.price,
          item.subtotal
        ]
      );
    }

    // Inisialisasi Midtrans Snap Transaction
    let snapToken = null;
    let midtransRedirectUrl = null;

    try {
      const snapItemDetails = processedItems.map((it) => ({
        id: it.ticket_category_id,
        price: Math.round(Number(it.price)),
        quantity: it.quantity,
        name: `${it.category_name}`.slice(0, 50)
      }));

      if (adminFee > 0) {
        snapItemDetails.push({
          id: "ADMIN-FEE",
          price: adminFee,
          quantity: 1,
          name: "Biaya Layanan Platform"
        });
      }

      const snapParameter = {
        transaction_details: {
          order_id: invoiceCode,
          gross_amount: Math.round(totalAmount)
        },
        customer_details: {
          first_name: buyer_name,
          email: buyer_email,
          phone: buyer_phone
        },
        item_details: snapItemDetails
      };

      const snapResponse = await snap.createTransaction(snapParameter);
      snapToken = snapResponse.token;
      midtransRedirectUrl = snapResponse.redirect_url;
    } catch (midtransErr) {
      console.warn("Midtrans Sandbox API Warning:", midtransErr.message);
      // Fallback demo token untuk testing UKK jika akun midtrans sandbox belum diset
      snapToken = `DEMO-SNAP-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    }

    // Simpan snap token di order
    await client.query(
      `UPDATE orders SET snap_token = $1 WHERE id = $2`,
      [snapToken, order.id]
    );

    // Buat record pembayaran
    await client.query(
      `INSERT INTO payments
       (order_id, payment_method, transaction_id, status)
       VALUES ($1, 'midtrans', $2, 'pending')`,
      [order.id, invoiceCode]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Order checkout berhasil dibuat",
      data: {
        order: {
          ...order,
          snap_token: snapToken
        },
        snap_token: snapToken,
        redirect_url: midtransRedirectUrl,
        client_key: clientKey
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Checkout Order Error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Gagal memproses checkout pesanan"
    });
  } finally {
    client.release();
  }
};

// ==========================================
// 2. GET ORDER STATUS (Polling / Sync)
// ==========================================
const getOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const whereClause = isUUID(id) ? `o.id = $1` : `o.invoice_code = $1`;

    const orderRes = await pool.query(
      `SELECT o.*, e.name as event_name, e.poster as event_poster, e.event_date, e.event_time, e.venue, e.city
       FROM orders o
       LEFT JOIN events e ON e.id = o.event_id
       WHERE ${whereClause}`,
      [id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order tidak ditemukan" });
    }

    const order = orderRes.rows[0];

    // Jika masih pending, periksa status pembayaran terkini langsung ke Midtrans API
    if (order.status === "pending" || order.payment_status === "pending") {
      try {
        const { coreApi } = require("../config/midtrans");
        const statusResponse = await coreApi.transaction.status(order.invoice_code);
        const txStatus = statusResponse?.transaction_status;

        if (txStatus === "settlement" || txStatus === "capture") {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await client.query(
              `UPDATE orders 
               SET status = 'paid', payment_status = 'settlement', midtrans_transaction_id = $1 
               WHERE id = $2`,
              [statusResponse.transaction_id || statusResponse.order_id, order.id]
            );
            await client.query(
              `UPDATE payments 
               SET status = 'success', paid_at = NOW(), transaction_id = $1 
               WHERE order_id = $2`,
              [statusResponse.transaction_id || statusResponse.order_id, order.id]
            );
            await generateTicketsForOrder(client, order.id);
            await client.query("COMMIT");

            order.status = "paid";
            order.payment_status = "settlement";
          } catch (syncErr) {
            await client.query("ROLLBACK");
            console.error("Auto-sync Midtrans payment error:", syncErr);
          } finally {
            client.release();
          }
        }
      } catch (midtransCheckErr) {
        // Abaikan jika order belum terdaftar di Midtrans API
      }
    }

    const paymentRes = await pool.query(
      `SELECT * FROM payments WHERE order_id = $1 ORDER BY paid_at DESC NULLS LAST LIMIT 1`,
      [order.id]
    );

    const ticketsRes = await pool.query(
      `SELECT t.*, tc.name as category_name
       FROM tickets t
       LEFT JOIN order_details od ON od.id = t.order_detail_id
       LEFT JOIN ticket_categories tc ON tc.id = od.ticket_category_id
       WHERE t.order_id = $1
       ORDER BY t.created_at ASC`,
      [order.id]
    );

    res.json({
      success: true,
      data: {
        order,
        payment: paymentRes.rows[0] || null,
        tickets: ticketsRes.rows
      }
    });
  } catch (error) {
    console.error("Get Order Status Error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil status pesanan" });
  }
};

// ==========================================
// 3. SIMULATE PAYMENT (Midtrans Sandbox Demo)
// ==========================================
const simulatePayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const whereClause = isUUID(id) ? `id = $1` : `invoice_code = $1`;

    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT * FROM orders WHERE ${whereClause} FOR UPDATE`,
      [id]
    );

    if (orderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Order tidak ditemukan" });
    }

    const order = orderRes.rows[0];

    // Update status order menjadi paid
    await client.query(
      `UPDATE orders 
       SET status = 'paid', payment_status = 'settlement', midtrans_transaction_id = COALESCE(midtrans_transaction_id, $1)
       WHERE id = $2`,
      [`SIM-${Date.now()}`, order.id]
    );

    // Update status payment
    await client.query(
      `UPDATE payments 
       SET status = 'success', paid_at = NOW(), transaction_id = COALESCE(transaction_id, $1)
       WHERE order_id = $2`,
      [`SIM-${Date.now()}`, order.id]
    );

    // Terbitkan tiket otomatis
    const generatedTickets = await generateTicketsForOrder(client, order.id);

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Pembayaran Midtrans Sandbox berhasil diverifikasi & E-Ticket resmi telah terbit!",
      data: {
        order_id: order.id,
        invoice_code: order.invoice_code,
        status: "paid",
        payment_status: "settlement",
        tickets_count: generatedTickets.length,
        tickets: generatedTickets
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Simulate Payment Error:", error);
    res.status(500).json({ success: false, message: "Gagal memproses simulasi pembayaran" });
  } finally {
    client.release();
  }
};

// ==========================================
// 4. GET ORDER E-TICKETS (Step 4 Final)
// ==========================================
const getOrderETickets = async (req, res) => {
  try {
    const { id } = req.params;
    const whereClause = isUUID(id) ? `o.id = $1` : `o.invoice_code = $1`;

    const orderRes = await pool.query(
      `SELECT o.*, e.name as event_name, e.poster as event_poster, e.event_date, e.event_time, e.venue, e.city, e.description as event_description
       FROM orders o
       LEFT JOIN events e ON e.id = o.event_id
       WHERE ${whereClause}`,
      [id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order tidak ditemukan" });
    }

    const order = orderRes.rows[0];

    if (order.status !== "paid" && order.payment_status !== "settlement") {
      return res.status(400).json({
        success: false,
        message: "E-Ticket hanya dapat diakses setelah pembayaran selesai dan terverifikasi.",
        status: order.status,
        payment_status: order.payment_status
      });
    }

    const detailsRes = await pool.query(
      `SELECT od.*, tc.name as category_name
       FROM order_details od
       JOIN ticket_categories tc ON tc.id = od.ticket_category_id
       WHERE od.order_id = $1`,
      [order.id]
    );

    const ticketsRes = await pool.query(
      `SELECT t.*, tc.name as ticket_category
       FROM tickets t
       LEFT JOIN order_details od ON od.id = t.order_detail_id
       LEFT JOIN ticket_categories tc ON tc.id = od.ticket_category_id
       WHERE t.order_id = $1
       ORDER BY t.created_at ASC`,
      [order.id]
    );

    res.json({
      success: true,
      data: {
        order,
        details: detailsRes.rows,
        tickets: ticketsRes.rows
      }
    });
  } catch (error) {
    console.error("Get Order E-Tickets Error:", error);
    res.status(500).json({ success: false, message: "Gagal memuat E-Ticket transaksi" });
  }
};

// ==========================================
// Existing Functions (Backward Compatibility)
// ==========================================
const createOrder = async (req, res) => {
  return createCheckoutOrder(req, res);
};

const getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT o.*, COUNT(od.id)::int AS item_count, e.name as event_name, e.poster as event_poster
       FROM orders o
       LEFT JOIN order_details od ON od.order_id = o.id
       LEFT JOIN events e ON e.id = o.event_id
       WHERE o.user_id = $1
       GROUP BY o.id, e.name, e.poster
       ORDER BY o.created_at DESC`,
      [userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal mengambil order" });
  }
};

const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT o.*, u.name AS buyer_name_user, u.email AS buyer_email_user, e.name as event_name, e.venue, e.event_date
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN events e ON e.id = o.event_id
       WHERE o.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order tidak ditemukan" });
    }

    const detailResult = await pool.query(
      `SELECT od.*, tc.name AS ticket_category, e.name AS event_name
       FROM order_details od
       JOIN ticket_categories tc ON tc.id = od.ticket_category_id
       JOIN events e ON e.id = tc.event_id
       WHERE od.order_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        order: result.rows[0],
        details: detailResult.rows
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal mengambil detail order" });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, u.name AS buyer_name_user, u.email AS buyer_email_user, e.name as event_name
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN events e ON e.id = o.event_id
      ORDER BY o.created_at DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal mengambil semua order" });
  }
};

module.exports = {
  createCheckoutOrder,
  createOrder,
  getOrderStatus,
  simulatePayment,
  getOrderETickets,
  getMyOrders,
  getOrderById,
  getAllOrders,
  generateTicketsForOrder
};
