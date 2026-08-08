const pool = require("../config/db");

// Check-in tiket
const checkinTicket = async (req, res) => {
  const client = await pool.connect();

  try {
    const staffId = req.user.id;
    const { ticket_code } = req.body;

    if (!ticket_code) {
      return res.status(400).json({
        success: false,
        message: "Ticket code wajib diisi"
      });
    }

    await client.query("BEGIN");

    const ticketResult = await client.query(
      `
      SELECT
        t.id,
        t.ticket_code,
        t.status,
        e.id AS event_id,
        e.name AS event_name,
        e.event_date,
        e.event_time,
        tc.name AS ticket_category
      FROM tickets t
      JOIN order_details od
        ON od.id = t.order_detail_id
      JOIN ticket_categories tc
        ON tc.id = od.ticket_category_id
      JOIN events e
        ON e.id = tc.event_id
      WHERE t.ticket_code = $1
      FOR UPDATE
      `,
      [ticket_code]
    );

    if (ticketResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Tiket tidak ditemukan"
      });
    }

    const ticket = ticketResult.rows[0];

    if (ticket.status === "used") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Tiket sudah digunakan"
      });
    }

    // Cek apakah petugas ditugaskan pada event tersebut
    const staffResult = await client.query(
      `
      SELECT *
      FROM event_staff
      WHERE event_id = $1
      AND user_id = $2
      `,
      [
        ticket.event_id,
        staffId
      ]
    );

    if (staffResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "Anda bukan petugas untuk event ini"
      });
    }

    await client.query(
      `
      UPDATE tickets
      SET status = 'used'
      WHERE id = $1
      `,
      [ticket.id]
    );

    const checkinResult = await client.query(
      `
      INSERT INTO checkins
      (ticket_id, staff_id)
      VALUES ($1, $2)
      RETURNING *
      `,
      [
        ticket.id,
        staffId
      ]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Check-in berhasil",
      data: {
        ticket: ticket,
        checkin: checkinResult.rows[0]
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal melakukan check-in"
    });
  } finally {
    client.release();
  }
};

// Riwayat checkin event
const getEventCheckins = async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.checkin_time,
        t.ticket_code,
        tc.name AS ticket_category,
        u.name AS staff_name
      FROM checkins c
      JOIN tickets t
        ON t.id = c.ticket_id
      JOIN order_details od
        ON od.id = t.order_detail_id
      JOIN ticket_categories tc
        ON tc.id = od.ticket_category_id
      JOIN events e
        ON e.id = tc.event_id
      JOIN users u
        ON u.id = c.staff_id
      WHERE e.id = $1
      ORDER BY c.checkin_time DESC
      `,
      [eventId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Gagal mengambil data check-in"
    });
  }
};

module.exports = {
  checkinTicket,
  getEventCheckins
};