const pool = require("../config/db");

const getDashboard = async (req, res) => {
  try {
    const [
      users,
      events,
      organizers,
      orders,
      tickets,
      revenue,
      pendingOrders,
      recentOrders
    ] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM users
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM events
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM organizers
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM orders
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM tickets
      `),

      pool.query(`
        SELECT COALESCE(SUM(total), 0) AS total
        FROM orders
        WHERE status = 'paid'
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM orders
        WHERE status = 'pending'
      `),

      pool.query(`
        SELECT
          o.id,
          o.invoice_code,
          o.total,
          o.status,
          o.created_at,
          u.name AS buyer_name
        FROM orders o
        JOIN users u ON u.id = o.user_id
        ORDER BY o.created_at DESC
        LIMIT 10
      `)
    ]);

    res.json({
      success: true,
      data: {
        total_users: users.rows[0].total,
        total_events: events.rows[0].total,
        total_organizers: organizers.rows[0].total,
        total_orders: orders.rows[0].total,
        total_tickets: tickets.rows[0].total,
        total_revenue: revenue.rows[0].total,
        pending_orders: pendingOrders.rows[0].total,
        recent_orders: recentOrders.rows
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal mengambil data dashboard"
    });
  }
};

// Statistik penjualan per event
const getEventStatistics = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id,
        e.name,
        COUNT(t.id)::int AS tickets_sold,
        COALESCE(SUM(od.quantity * od.price), 0) AS revenue
      FROM events e
      LEFT JOIN ticket_categories tc
        ON tc.event_id = e.id
      LEFT JOIN order_details od
        ON od.ticket_category_id = tc.id
      LEFT JOIN orders o
        ON o.id = od.order_id
        AND o.status = 'paid'
      LEFT JOIN tickets t
        ON t.order_detail_id = od.id
      GROUP BY e.id, e.name
      ORDER BY revenue DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal mengambil statistik event"
    });
  }
};

module.exports = {
  getDashboard,
  getEventStatistics
};