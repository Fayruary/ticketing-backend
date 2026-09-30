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

// Dashboard statistik petugas lapangan
const getPetugasDashboard = async (req, res) => {
  try {
    const staffId = req.user.id;

    // Ambil penugasan event staff
    const staffEvents = await pool.query(
      "SELECT event_id FROM event_staff WHERE user_id = $1",
      [staffId]
    );

    const eventIds = staffEvents.rows.map((r) => r.event_id);

    let onlineQuery, offlineQuery, checkinQuery, capacityQuery;

    if (eventIds.length > 0) {
      onlineQuery = pool.query(
        `
        SELECT COUNT(t.id)::int AS total
        FROM tickets t
        JOIN order_details od ON od.id = t.order_detail_id
        JOIN ticket_categories tc ON tc.id = od.ticket_category_id
        WHERE tc.event_id = ANY($1::uuid[])
        `,
        [eventIds]
      );

      offlineQuery = pool.query(
        `
        SELECT COALESCE(SUM(quantity), 0)::int AS total
        FROM offline_sales
        WHERE event_id = ANY($1::uuid[])
        `,
        [eventIds]
      );

      checkinQuery = pool.query(
        `
        SELECT COUNT(c.id)::int AS total
        FROM checkins c
        JOIN tickets t ON t.id = c.ticket_id
        JOIN order_details od ON od.id = t.order_detail_id
        JOIN ticket_categories tc ON tc.id = od.ticket_category_id
        WHERE tc.event_id = ANY($1::uuid[])
        `,
        [eventIds]
      );

      capacityQuery = pool.query(
        `
        SELECT COALESCE(SUM(capacity), 0)::int AS total
        FROM events
        WHERE id = ANY($1::uuid[])
        `,
        [eventIds]
      );
    } else {
      onlineQuery = pool.query(
        `
        SELECT COUNT(t.id)::int AS total
        FROM tickets t
        WHERE t.order_detail_id IS NOT NULL
        `
      );

      offlineQuery = pool.query(
        `
        SELECT COALESCE(SUM(quantity), 0)::int AS total
        FROM offline_sales
        `
      );

      checkinQuery = pool.query(
        "SELECT COUNT(*)::int AS total FROM checkins"
      );

      capacityQuery = pool.query(
        "SELECT COALESCE(SUM(capacity), 1000)::int AS total FROM events"
      );
    }

    const [onlineRes, offlineRes, checkinRes, capRes] = await Promise.all([
      onlineQuery,
      offlineQuery,
      checkinQuery,
      capacityQuery
    ]);

    const online = onlineRes.rows[0].total;
    const offline = offlineRes.rows[0].total;
    const total = online + offline;
    const checkedIn = checkinRes.rows[0].total;
    const notCheckedIn = Math.max(0, total - checkedIn);
    const capacity = capRes.rows[0].total || 1000;
    const remaining = Math.max(0, capacity - total);

    res.json({
      success: true,
      data: {
        total_tickets: total,
        online_tickets: online,
        offline_tickets: offline,
        checked_in: checkedIn,
        not_checked_in: notCheckedIn,
        remaining_tickets: remaining
      }
    });
  } catch (error) {
    console.error("Petugas dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil dashboard petugas"
    });
  }
};

module.exports = {
  getDashboard,
  getEventStatistics,
  getPetugasDashboard
};