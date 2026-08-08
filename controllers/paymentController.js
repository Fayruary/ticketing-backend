const crypto = require("crypto");
const pool = require("../config/db");

const generateTicketCode = () => {
  return `TKT-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
};

// CREATE PAYMENT
const createPayment = async (req, res) => {
  try {
    const {
      order_id,
      payment_method
    } = req.body;

    if (!order_id || !payment_method) {
      return res.status(400).json({
        success: false,
        message: "Order ID dan payment method wajib diisi"
      });
    }

    const orderResult = await pool.query(
      `
      SELECT *
      FROM orders
      WHERE id = $1
      `,
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO payments
      (order_id, payment_method, status)
      VALUES ($1, $2, 'pending')
      RETURNING *
      `,
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
      `
      SELECT *
      FROM payments
      WHERE order_id = $1
      ORDER BY paid_at DESC NULLS LAST
      `,
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
    const {
      status,
      transaction_id
    } = req.body;

    if (!["pending", "success", "failed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status payment tidak valid"
      });
    }

    await client.query("BEGIN");

    const paymentResult = await client.query(
      `
      SELECT *
      FROM payments
      WHERE id = $1
      FOR UPDATE
      `,
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
      `
      UPDATE payments
      SET
        status = $1,
        transaction_id = COALESCE($2, transaction_id),
        paid_at = CASE
          WHEN $1 = 'success' THEN now()
          ELSE paid_at
        END
      WHERE id = $3
      RETURNING *
      `,
      [status, transaction_id || null, id]
    );

    // Jika berhasil dibayar
    if (status === "success") {
      await client.query(
        `
        UPDATE orders
        SET status = 'paid'
        WHERE id = $1
        `,
        [payment.order_id]
      );

      const detailsResult = await client.query(
        `
        SELECT *
        FROM order_details
        WHERE order_id = $1
        `,
        [payment.order_id]
      );

      // Generate ticket
      for (const detail of detailsResult.rows) {
        const existingResult = await client.query(
          `
          SELECT COUNT(*)::int AS count
          FROM tickets
          WHERE order_detail_id = $1
          `,
          [detail.id]
        );

        const existingCount = existingResult.rows[0].count;
        const needed = detail.quantity - existingCount;

        for (let i = 0; i < needed; i++) {
          const ticketCode = generateTicketCode();

          await client.query(
            `
            INSERT INTO tickets
            (order_detail_id, ticket_code, qr_code, status)
            VALUES ($1, $2, $2, 'active')
            `,
            [
              detail.id,
              ticketCode
            ]
          );
        }
      }
    }

    if (status === "failed") {
      await client.query(
        `
        UPDATE orders
        SET status = 'failed'
        WHERE id = $1
        `,
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

module.exports = {
  createPayment,
  getPaymentByOrder,
  updatePaymentStatus
};