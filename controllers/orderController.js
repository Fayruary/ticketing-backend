const pool = require("../config/db");

const generateInvoice = () => {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `INV-${Date.now()}-${random}`;
};

// CREATE ORDER
const createOrder = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.id;
    const { items } = req.body;

    /*
      items:
      [
        {
          ticket_category_id: "uuid",
          quantity: 2
        }
      ]
    */

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Item pembelian wajib diisi"
      });
    }

    await client.query("BEGIN");

    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const {
        ticket_category_id,
        quantity
      } = item;

      if (!ticket_category_id || !quantity || quantity <= 0) {
        throw new Error("Data item tiket tidak valid");
      }

      const categoryResult = await client.query(
        `
        SELECT *
        FROM ticket_categories
        WHERE id = $1
        FOR UPDATE
        `,
        [ticket_category_id]
      );

      if (categoryResult.rows.length === 0) {
        throw new Error("Kategori tiket tidak ditemukan");
      }

      const category = categoryResult.rows[0];

      if (category.stock < quantity) {
        throw new Error(
          `Stock tiket ${category.name} tidak mencukupi`
        );
      }

      const subtotal =
        Number(category.price) * Number(quantity);

      total += subtotal;

      orderItems.push({
        ticket_category_id,
        quantity,
        price: category.price
      });

      await client.query(
        `
        UPDATE ticket_categories
        SET stock = stock - $1
        WHERE id = $2
        `,
        [quantity, ticket_category_id]
      );
    }

    const invoiceCode = generateInvoice();

    const orderResult = await client.query(
      `
      INSERT INTO orders
      (user_id, invoice_code, total, status)
      VALUES ($1, $2, $3, 'pending')
      RETURNING *
      `,
      [userId, invoiceCode, total]
    );

    const order = orderResult.rows[0];

    for (const item of orderItems) {
      await client.query(
        `
        INSERT INTO order_details
        (order_id, ticket_category_id, quantity, price)
        VALUES ($1, $2, $3, $4)
        `,
        [
          order.id,
          item.ticket_category_id,
          item.quantity,
          item.price
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Order berhasil dibuat",
      data: order
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(400).json({
      success: false,
      message: error.message || "Gagal membuat order"
    });
  } finally {
    client.release();
  }
};

// GET order milik user
const getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        o.*,
        COUNT(od.id)::int AS item_count
      FROM orders o
      LEFT JOIN order_details od
        ON od.order_id = o.id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
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
      message: "Gagal mengambil order"
    });
  }
};

// GET detail order
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        o.id,
        o.invoice_code,
        o.total,
        o.status,
        o.created_at,
        u.name AS buyer_name,
        u.email AS buyer_email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan"
      });
    }

    const detailResult = await pool.query(
      `
      SELECT
        od.*,
        tc.name AS ticket_category,
        e.name AS event_name
      FROM order_details od
      JOIN ticket_categories tc
        ON tc.id = od.ticket_category_id
      JOIN events e
        ON e.id = tc.event_id
      WHERE od.order_id = $1
      `,
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

    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail order"
    });
  }
};

// GET semua order untuk admin
const getAllOrders = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.*,
        u.name AS buyer_name,
        u.email AS buyer_email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal mengambil semua order"
    });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  getAllOrders
};