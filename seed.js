const bcrypt = require("bcrypt");
const pool = require("./config/db");

async function seed() {
  const client = await pool.connect();
  try {
    console.log("Seeding database...");
    await client.query("BEGIN");

    // 1. Users
    const passwordHash = await bcrypt.hash("password123", 10);
    const adminHash = await bcrypt.hash("admin123", 10);
    const petugasHash = await bcrypt.hash("petugas123", 10);

    const adminUser = await client.query(`
      INSERT INTO users (name, email, phone, password, role)
      VALUES ($1, $2, $3, $4, 'admin')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, email, role
    `, ["Admin TixGoo", "admin@tixgoo.com", "081234567890", adminHash]);

    const petugasUser = await client.query(`
      INSERT INTO users (name, email, phone, password, role)
      VALUES ($1, $2, $3, $4, 'petugas')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, email, role
    `, ["Petugas Lapangan Gate 1", "petugas@tixgoo.com", "081298765432", petugasHash]);

    const regularUser = await client.query(`
      INSERT INTO users (name, email, phone, password, role)
      VALUES ($1, $2, $3, $4, 'user')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, email, role
    `, ["Ahmad Pratama", "user@tixgoo.com", "085612345678", passwordHash]);

    console.log("Users created:", {
      admin: adminUser.rows[0],
      petugas: petugasUser.rows[0],
      user: regularUser.rows[0]
    });

    // 2. Organizer
    const orgRes = await client.query(`
      INSERT INTO organizers (name, company_name, email, phone, address)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, ["Pesta Bebas Berselancar EO", "PT Nada Kreasi Nusantara", "partner@tixgoo.com", "021-5556789", "Jakarta Selatan"]);
    const orgId = orgRes.rows[0].id;

    // 3. Events
    const eventsData = [
      {
        name: "Sheila On 7: Tunggu Aku Di Jakarta",
        description: "Konser akbar Sheila On 7 menyapa penggemar setia di Jakarta dengan tata suara spektakuler dan membawakan 25 lagu hits terbaik mereka sepanjang masa.",
        poster: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80",
        city: "Jakarta",
        venue: "Jiexpo Kemayoran Jakarta",
        capacity: 25000,
        event_date: "2026-10-15",
        event_time: "19:00:00",
        status: "published"
      },
      {
        name: "Hindia: Menari Dengan Bayangan Tour",
        description: "Tur konser album fenomenal Baskara Putra (Hindia) dengan aransemen orkestra megah dan visual panggung yang menghipnotis ribuan penonton.",
        poster: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80",
        city: "Bandung",
        venue: "Stadion Pakansari Bogor - Bandung Area",
        capacity: 15000,
        event_date: "2026-10-22",
        event_time: "19:30:00",
        status: "published"
      },
      {
        name: "For Revenge: Perayaan Patah Hati",
        description: "Konser spesial For Revenge dengan deretan kolaborator papan atas Indonesia, membawakan lantunan musik rock emosional yang menyentuh hati.",
        poster: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
        city: "Surabaya",
        venue: "Grand City Convention Hall Surabaya",
        capacity: 10000,
        event_date: "2026-11-05",
        event_time: "20:00:00",
        status: "published"
      },
      {
        name: "Dewa 19 All Stars Stadium Tour",
        description: "Konser reuni akbar Dewa 19 bersama deretan vokalis legendaris (Ari Lasso, Once Mekel, Ello, Virzha) berpadu megah di stadion megah Yogyakarta.",
        poster: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=80",
        city: "Yogyakarta",
        venue: "Stadion Maguwoharjo Yogyakarta",
        capacity: 30000,
        event_date: "2026-11-20",
        event_time: "18:30:00",
        status: "published"
      },
      {
        name: "Soundrenaline Music Festival 2026",
        description: "Festival musik multigenre terbesar tanah air kembali hadir di Bali dengan 4 panggung spektakuler, menampilkan artis internasional dan lokal terbaik.",
        poster: "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1200&q=80",
        city: "Bali",
        venue: "GWK Cultural Park Bali",
        capacity: 20000,
        event_date: "2026-12-10",
        event_time: "15:00:00",
        status: "published"
      },
      {
        name: "Tulus: Tur Manusia 2026",
        description: "Penampilan intim dan hangat dari Tulus membawakan lagu-lagu hits yang menemani jutaan pendengar di Indonesia.",
        poster: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80",
        city: "Jakarta",
        venue: "Istora Senayan Jakarta",
        capacity: 8000,
        event_date: "2026-12-18",
        event_time: "19:00:00",
        status: "published"
      }
    ];

    const eventIds = [];
    for (const evt of eventsData) {
      const eRes = await client.query(`
        INSERT INTO events (organizer_id, name, description, poster, city, venue, capacity, event_date, event_time, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        orgId,
        evt.name,
        evt.description,
        evt.poster,
        evt.city,
        evt.venue,
        evt.capacity,
        evt.event_date,
        evt.event_time,
        evt.status
      ]);

      const eventId = eRes.rows[0].id;
      eventIds.push(eventId);

      // Kategori Tiket untuk event ini
      await client.query(`
        INSERT INTO ticket_categories (event_id, name, price, stock)
        VALUES
          ($1, 'Presale Festival', 300000, 100),
          ($1, 'Regular Tribune', 500000, 300),
          ($1, 'VIP Standing', 850000, 150),
          ($1, 'VVIP Soundcheck Access', 1500000, 30)
      `, [eventId]);
    }

    console.log("Events & Ticket Categories seeded:", eventIds.length);

    // 4. Assign staff to events
    for (const eventId of eventIds) {
      await client.query(`
        INSERT INTO event_staff (event_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [eventId, petugasUser.rows[0].id]);
    }
    console.log("Staff assigned to events.");

    // 5. Cooperation Packages
    const pkgs = [
      { name: "Paket Per Event", duration: "1 Event", price: 1500000, description: "Cocok untuk konser tunggal atau skala sedang dengan validasi tiket instan." },
      { name: "Paket 1 Bulan Unlimited", duration: "1 Bulan", price: 3500000, description: "Ideal untuk Event Organizer yang menyelenggarakan beberapa konser dalam 1 bulan." },
      { name: "Paket 3 Bulan Unlimited", duration: "3 Bulan", price: 8500000, description: "Pilihan terpopuler untuk festival musik dan tour konser berkala." },
      { name: "Paket 6 Bulan Exclusive", duration: "6 Bulan", price: 15000000, description: "Kemitraan jangka panjang dengan dukungan penuh support tim teknis lapangan." }
    ];

    for (const p of pkgs) {
      await client.query(`
        INSERT INTO cooperation_packages (name, duration, price, description)
        VALUES ($1, $2, $3, $4)
      `, [p.name, p.duration, p.price, p.description]);
    }
    console.log("Cooperation packages seeded.");

    // 6. Banners
    await client.query(`
      INSERT INTO banners (title, image, is_active)
      VALUES
        ('Sheila On 7 Tunggu Aku Di Jakarta', 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80', true),
        ('Soundrenaline Music Festival 2026', 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1200&q=80', true),
        ('Hindia Menari Dengan Bayangan Tour', 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80', true)
    `);
    console.log("Banners seeded.");

    await client.query("COMMIT");
    console.log("Seeding complete successfully!");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seeding error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
