const crypto = require("crypto");
const pool = require("../config/db");
const { serverKey } = require("../config/midtrans");

const generateTicketCode = () => {
  return `TKT-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
};

// CREATE PAYMENT
const createPayment = async (req, res) => {
  try {
    const { order_id, payment_method } = req.body;

    if (!order_id || !payment_method) {
      return res.status(400).json({
        success: false,
        message: "Order ID dan payment method wajib diisi"
      });
    }

    const orderResult = await pool.query(
      `SELECT * FROM orders WHERE id = $1`,
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan"
      });
    }

    const result = await pool.query(
      `INSERT INTO payments (order_id, payment_method, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [order_id, payment_method]
    );

    res.status(201).json({
      success: true,
      message: "Payment berhasil dibuat",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal membuat payment"
    });
  }
};

// GET payment berdasarkan order
const getPaymentByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await pool.query(
      `SELECT * FROM payments WHERE order_id = $1 ORDER BY paid_at DESC NULLS LAST`,
      [orderId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil payment"
    });
  }
};

// UPDATE STATUS PAYMENT
const updatePaymentStatus = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { status, transaction_id } = req.body;

    if (!["pending", "success", "failed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status payment tidak valid"
      });
    }

    await client.query("BEGIN");

    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Payment tidak ditemukan"
      });
    }

    const payment = paymentResult.rows[0];

    const updatedPayment = await client.query(
      `UPDATE payments
       SET status = $1,
           transaction_id = COALESCE($2, transaction_id),
           paid_at = CASE WHEN $1 = 'success' THEN now() ELSE paid_at END
       WHERE id = $3
       RETURNING *`,
      [status, transaction_id || null, id]
    );

    // Jika berhasil dibayar
    if (status === "success") {
      await client.query(
        `UPDATE orders SET status = 'paid', payment_status = 'settlement' WHERE id = $1`,
        [payment.order_id]
      );

      // Import generator function
      const { generateTicketsForOrder } = require("./orderController");
      await generateTicketsForOrder(client, payment.order_id);
    }

    if (status === "failed") {
      await client.query(
        `UPDATE orders SET status = 'failed' WHERE id = $1`,
        [payment.order_id]
      );
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Status payment berhasil diperbarui",
      data: updatedPayment.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui payment"
    });
  } finally {
    client.release();
  }
};

// ==========================================
// MIDTRANS WEBHOOK NOTIFICATION
// ==========================================
const handleMidtransNotification = async (req, res) => {
  const client = await pool.connect();

  try {
    const notification = req.body;
    const {
      order_id,
      transaction_status,
      fraud_status,
      status_code,
      gross_amount,
      signature_key,
      payment_type,
      transaction_id
    } = notification;

    if (!order_id) {
      return res.status(400).json({ success: false, message: "Order ID missing" });
    }

    // Verifikasi signature hash jika signature_key ada
    if (signature_key && serverKey) {
      const expectedSignature = crypto
        .createHash("sha512")
        .update(order_id + status_code + gross_amount + serverKey)
        .digest("hex");

      if (signature_key !== expectedSignature) {
        console.warn("Midtrans notification signature mismatch:", { order_id, signature_key });
        return res.status(403).json({ success: false, message: "Invalid signature" });
      }
    }

    await client.query("BEGIN");

    // Cari order berdasarkan invoice_code atau id
    const orderRes = await client.query(
      `SELECT * FROM orders WHERE invoice_code = $1 OR id::text = $1 FOR UPDATE`,
      [order_id]
    );

    if (orderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Order tidak ditemukan" });
    }

    const order = orderRes.rows[0];

    // Status mapping Midtrans
    let isSuccess = false;
    let isFailed = false;

    if (transaction_status === "capture") {
      if (fraud_status === "accept" || !fraud_status) {
        isSuccess = true;
      }
    } else if (transaction_status === "settlement") {
      isSuccess = true;
    } else if (["cancel", "deny", "expire"].includes(transaction_status)) {
      isFailed = true;
    }

    if (isSuccess) {
      await client.query(
        `UPDATE orders
         SET status = 'paid', payment_status = 'settlement', midtrans_transaction_id = $1
         WHERE id = $2`,
        [transaction_id || null, order.id]
      );

      await client.query(
        `UPDATE payments
         SET status = 'success', paid_at = NOW(), transaction_id = $1, payment_method = COALESCE($2, payment_method)
         WHERE order_id = $3`,
        [transaction_id || null, payment_type || "midtrans", order.id]
      );

      // Terbitkan tiket resmi & QR Code (idempotent, cek jika belum dibuat)
      const { generateTicketsForOrder } = require("./orderController");
      await generateTicketsForOrder(client, order.id);
    } else if (isFailed) {
      await client.query(
        `UPDATE orders SET status = 'failed', payment_status = $1 WHERE id = $2`,
        [transaction_status, order.id]
      );

      await client.query(
        `UPDATE payments SET status = 'failed' WHERE order_id = $1`,
        [order.id]
      );

      // Kembalikan kuota stok tiket jika gagal/expired
      const details = await client.query(
        `SELECT * FROM order_details WHERE order_id = $1`,
        [order.id]
      );
      for (const d of details.rows) {
        await client.query(
          `UPDATE ticket_categories SET stock = stock + $1 WHERE id = $2`,
          [d.quantity, d.ticket_category_id]
        );
      }
    } else if (transaction_status === "pending") {
      await client.query(
        `UPDATE orders SET payment_status = 'pending' WHERE id = $1`,
        [order.id]
      );
    }

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: `Notification processed successfully for order ${order_id}`
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Midtrans Webhook Notification Error:", err);
    res.status(500).json({ success: false, message: "Error processing webhook" });
  } finally {
    client.release();
  }
};

module.exports = {
  createPayment,
  getPaymentByOrder,
  updatePaymentStatus,
  handleMidtransNotification
};
