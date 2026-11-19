const pool = require("../config/db");

// ==========================================
// 1. DASHBOARD UTAMA ADMIN
// ==========================================
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
          COALESCE(o.buyer_name, u.name, 'Pembeli') AS buyer_name
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
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
    console.error("Get Dashboard Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data dashboard"
    });
  }
};

// ==========================================
// 2. STATISTIK PENJUALAN PER EVENT (ADMIN)
// ==========================================
const getEventStatistics = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id,
        e.name,
        COUNT(t.id)::int AS tickets_sold,
        COALESCE(SUM(od.quantity * od.price), 0) AS revenue
      FROM events e
      LEFT JOIN ticket_categories tc ON tc.event_id = e.id
      LEFT JOIN order_details od ON od.ticket_category_id = tc.id
      LEFT JOIN orders o ON o.id = od.order_id AND o.status = 'paid'
      LEFT JOIN tickets t ON t.order_detail_id = od.id
      GROUP BY e.id, e.name
      ORDER BY revenue DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error("Get Event Statistics Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil statistik event"
    });
  }
};

// ==========================================
// 3. DASHBOARD STATISTIK PETUGAS LAPANGAN
// (Wajib Validasi Permission 'view_reports')
// ==========================================
const getPetugasDashboard = async (req, res) => {
  try {
    const staffId = req.user.id;
    const userRole = req.user.role;
    const targetEventId = req.query.event_id || req.query.eventId;

    let eventIds = [];

    if (userRole === "admin") {
      // Admin dapat melihat seluruh event atau filter per-event
      if (targetEventId) {
        eventIds = [targetEventId];
      } else {
        const allEvents = await pool.query("SELECT id FROM events");
        eventIds = allEvents.rows.map((r) => r.id);
      }
    } else {
      // Petugas: Hanya boleh mengakses event yang aktif ditugaskan dan memiliki permission 'view_reports'
      const assignedEvents = await pool.query(
        `
        SELECT DISTINCT es.event_id
        FROM event_staff es
        JOIN event_staff_permissions esp ON esp.event_staff_id = es.id
        WHERE es.user_id = $1 
          AND es.is_active = true 
          AND esp.permission = 'view_reports'
        `,
        [staffId]
      );

      const authorizedEventIds = assignedEvents.rows.map((r) => r.event_id);

      // Jika petugas tidak memiliki satupun event dengan permission 'view_reports'
      if (authorizedEventIds.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Anda tidak memiliki izin 'view_reports' untuk mengakses dashboard laporan statistik",
        });
      }

      // Jika petugas meminta statistik event tertentu
      if (targetEventId) {
        if (!authorizedEventIds.includes(targetEventId)) {
          return res.status(403).json({
            success: false,
            message: "Anda tidak memiliki izin 'view_reports' untuk event yang dipilih",
          });
        }
        eventIds = [targetEventId];
      } else {
        eventIds = authorizedEventIds;
      }
    }

    if (eventIds.length === 0) {
      return res.json({
        success: true,
        data: {
          total_tickets: 0,
          online_tickets: 0,
          offline_tickets: 0,
          checked_in: 0,
          not_checked_in: 0,
          remaining_tickets: 0,
        },
      });
    }

    // Hitung statistik HANYA untuk event yang diotorisasi
    const [onlineRes, offlineRes, checkinRes, capRes] = await Promise.all([
      pool.query(
        `
        SELECT COUNT(t.id)::int AS total
        FROM tickets t
        LEFT JOIN order_details od ON od.id = t.order_detail_id
        LEFT JOIN ticket_categories tc ON tc.id = od.ticket_category_id
        LEFT JOIN orders o ON o.id = t.order_id OR o.id = od.order_id
        WHERE (tc.event_id = ANY($1::uuid[]) OR o.event_id = ANY($1::uuid[]))
          AND t.order_detail_id IS NOT NULL
        `,
        [eventIds]
      ),

      pool.query(
        `
        SELECT COALESCE(SUM(quantity), 0)::int AS total
        FROM offline_sales
        WHERE event_id = ANY($1::uuid[])
        `,
        [eventIds]
      ),

      pool.query(
        `
        SELECT COUNT(c.id)::int AS total
        FROM checkins c
        JOIN tickets t ON t.id = c.ticket_id
        LEFT JOIN order_details od ON od.id = t.order_detail_id
        LEFT JOIN ticket_categories tc ON tc.id = od.ticket_category_id
        LEFT JOIN orders o ON o.id = t.order_id OR o.id = od.order_id
        WHERE (tc.event_id = ANY($1::uuid[]) OR o.event_id = ANY($1::uuid[]))
        `,
        [eventIds]
      ),

      pool.query(
        `
        SELECT COALESCE(SUM(capacity), 1000)::int AS total
        FROM events
        WHERE id = ANY($1::uuid[])
        `,
        [eventIds]
      ),
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
        remaining_tickets: remaining,
        events_counted: eventIds.length,
      },
    });
  } catch (error) {
    console.error("Petugas dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil dashboard petugas",
    });
  }
};

module.exports = {
  getDashboard,
  getEventStatistics,
  getPetugasDashboard,
};
