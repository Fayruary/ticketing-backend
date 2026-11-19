/**
 * ============================================================================
 * SCRIPT PENGUJIAN INTEGRASI OPERASIONAL TAHAP 2 (REFACTORED)
 * ============================================================================
 * Fitur yang diuji:
 *  1. Check-in tiket & pencegahan double check-in
 *  2. Pengamanan riwayat pengunjung (permission: view_visitors)
 *  3. Penjualan tiket offline OTS & isolasi penugasan event (permission: offline_sales)
 *  4. Konsistensi stok tiket (atomic stock decrement & safe delta recovery)
 *  5. Dashboard laporan statistik (permission: view_reports)
 *
 * Standar Refactoring:
 *  - Relative module imports (tanpa absolute Windows path)
 *  - External package import melalui nama (require('bcrypt'))
 *  - Identifikasi data pengujian berbasis testRunId unik
 *  - ID-based selective cleanup (tanpa query global bermotif wildcard)
 *  - Non-destructive delta-based stock recovery (stock = stock + deducted)
 *  - Robust try/catch/finally error handling & deterministic exit codes
 * ============================================================================
 */

// 1. External packages
const bcrypt = require("bcrypt");

// 2. Internal application modules (relative paths from /tests)
const pool = require("../config/db");
const checkinController = require("../controllers/checkinController");
const offlineSaleController = require("../controllers/offlineSaleController");
const dashboardController = require("../controllers/dashboardController");

// Helper: Mock Express Response Object
function createMockRes() {
  return {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
  };
}

/**
 * Pembersihan data testing secara selektif hanya berdasarkan ID yang dicatat.
 * Mencegah penghapusan data produksi atau data pengujian lain.
 */
async function performSelectiveCleanup(clientOrPool, resources) {
  console.log("\n[Cleanup] Menjalankan pembersihan data testing secara selektif...");

  // 1. Pulihkan stok tiket berdasarkan delta kuantitas yang dipotong oleh testing
  // Tidak menggunakan snapshot lama agar tidak menimpa transaksi lain yang berjalan bersamaan
  if (resources.stockDeductions && resources.stockDeductions.length > 0) {
    for (const deduction of resources.stockDeductions) {
      console.log(`  -> Memulihkan stok kategori ${deduction.categoryId} (+${deduction.quantity})...`);
      await clientOrPool.query(
        "UPDATE ticket_categories SET stock = stock + $1 WHERE id = $2",
        [deduction.quantity, deduction.categoryId]
      );
    }
  }

  // 2. Hapus checkins yang dibuat oleh testing
  // Prioritas 1: Hapus berdasarkan ID check-in yang tercatat selama testing
  if (resources.checkinIds && resources.checkinIds.length > 0) {
    await clientOrPool.query(
      "DELETE FROM checkins WHERE id = ANY($1::bigint[])",
      [resources.checkinIds]
    );
  }

  // Prioritas 2: Hapus check-in yang terhubung ke tiket testing saat ini (misal dari penjualan offline OTS)
  if (resources.ticketIds && resources.ticketIds.length > 0) {
    await clientOrPool.query(
      "DELETE FROM checkins WHERE ticket_id = ANY($1::uuid[])",
      [resources.ticketIds]
    );
  }

  // Prioritas 3 (Safeguard Relasi): Hapus check-in yang dibuat oleh petugas testing saat ini
  // Alasan teknis: Tabel checkins memiliki foreign key constraint 'checkins_staff_id_fkey' ke tabel users(id).
  // resources.userId adalah UUID unik yang dibuat khusus untuk testRunId ini, sehingga tidak mungkin menghapus data petugas lain.
  if (resources.userId) {
    await clientOrPool.query(
      "DELETE FROM checkins WHERE staff_id = $1",
      [resources.userId]
    );
  }

  // 3. Hapus offline_sales yang dibuat oleh testing
  if (resources.offlineSaleIds && resources.offlineSaleIds.length > 0) {
    await clientOrPool.query(
      "DELETE FROM offline_sales WHERE id = ANY($1::uuid[])",
      [resources.offlineSaleIds]
    );
  }

  // 4. Hapus tiket yang dibuat oleh testing
  if (resources.ticketIds && resources.ticketIds.length > 0) {
    await clientOrPool.query(
      "DELETE FROM tickets WHERE id = ANY($1::uuid[])",
      [resources.ticketIds]
    );
  }

  // 5. Hapus order_details testing
  if (resources.orderDetailId) {
    await clientOrPool.query(
      "DELETE FROM order_details WHERE id = $1",
      [resources.orderDetailId]
    );
  }

  // 6. Hapus dummy order testing
  if (resources.orderId) {
    await clientOrPool.query(
      "DELETE FROM orders WHERE id = $1",
      [resources.orderId]
    );
  }

  // 7. Hapus penugasan staff dan permissions testing
  if (resources.eventStaffId) {
    await clientOrPool.query(
      "DELETE FROM event_staff_permissions WHERE event_staff_id = $1",
      [resources.eventStaffId]
    );
    await clientOrPool.query(
      "DELETE FROM event_staff WHERE id = $1",
      [resources.eventStaffId]
    );
  }

  // 8. Hapus user testing
  if (resources.userId) {
    await clientOrPool.query(
      "DELETE FROM users WHERE id = $1",
      [resources.userId]
    );
  }

  console.log("  -> Pembersihan data selektif selesai (foreign key safe, no data leaks).");
}

/**
 * Fungsi utama pengujian seluruh skenario Tahap 2
 */
async function runTahap2TestSuite() {
  const testRunId = `t2_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  console.log(`=== STARTING TAHAP 2 OPERATIONAL SECURITY TEST SUITE (Run ID: ${testRunId}) ===`);

  // Struktur pelacakan ID sumber daya yang dibuat selama proses testing
  const resources = {
    testRunId,
    userId: null,
    eventStaffId: null,
    orderId: null,
    orderDetailId: null,
    ticketIds: [],
    checkinIds: [],
    offlineSaleIds: [],
    stockDeductions: [],
  };

  let testError = null;
  let cleanupError = null;

  try {
    // -------------------------------------------------------------
    // G. VERIFIKASI KEAMANAN ENVIRONMENT DATABASE
    // -------------------------------------------------------------
    const isSandboxMidtrans = process.env.MIDTRANS_IS_PRODUCTION !== "true";
    console.log(`[DB Check] Status Midtrans Sandbox: ${isSandboxMidtrans ? "AKTIF (Aman)" : "PRODUKSI (Bahaya)"}`);
    if (!isSandboxMidtrans) {
      throw new Error("PENGUJIAN DIBATALKAN: Environment terdeteksi sebagai database/payment PRODUKSI!");
    }

    // -------------------------------------------------------------
    // PERSIAPAN DATA TESTING TERISOLASI
    // -------------------------------------------------------------
    // Ambil 2 event untuk menguji isolasi multi-event
    const eventsRes = await pool.query(
      "SELECT id, name FROM events ORDER BY created_at ASC LIMIT 2"
    );
    if (eventsRes.rows.length < 2) {
      throw new Error("Dibutuhkan minimal 2 event untuk menguji isolasi penugasan event!");
    }
    const eventA = eventsRes.rows[0];
    const eventB = eventsRes.rows[1];
    console.log(`[Setup] Event A (Tanggung Jawab): "${eventA.name}" (${eventA.id})`);
    console.log(`        Event B (Bukan Tanggung Jawab): "${eventB.name}" (${eventB.id})`);

    // Ambil kategori tiket Event A
    const catRes = await pool.query(
      "SELECT id, name, price, stock FROM ticket_categories WHERE event_id = $1 LIMIT 1",
      [eventA.id]
    );
    if (catRes.rows.length === 0) {
      throw new Error("Event A tidak memiliki kategori tiket untuk testing!");
    }
    const catA = catRes.rows[0];
    console.log(`        Kategori Tiket Event A: ${catA.name} (Stok Saat Ini: ${catA.stock})`);

    // 1. Buat Petugas Uji Coba dengan email unik berbasis testRunId
    const testEmail = `petugas_${testRunId}@tixgoo.test`;
    const hashedPass = await bcrypt.hash("password123", 10);
    const userRes = await pool.query(
      "INSERT INTO users (name, email, phone, password, role) VALUES ($1, $2, $3, $4, 'petugas') RETURNING id",
      [`Petugas Ops ${testRunId}`, testEmail, "081999888777", hashedPass]
    );
    resources.userId = userRes.rows[0].id;
    console.log(`        Petugas Uji ID: ${resources.userId}`);

    // 2. Buat Tiket Uji Coba 1 untuk Event A
    const tCode1 = `TIX-${testRunId}-1`;
    const tRes1 = await pool.query(
      `INSERT INTO tickets (ticket_code, qr_code, status, owner_name, owner_email) VALUES ($1, $2, 'active', 'Pengunjung 1', 'visitor1@test.com') RETURNING id, ticket_code`,
      [tCode1, tCode1]
    );
    const testTicketA1 = tRes1.rows[0];
    resources.ticketIds.push(testTicketA1.id);

    // Hubungkan ticket1 ke kategori event A via dummy order & order_details
    const dummyOrder = await pool.query(
      "INSERT INTO orders (invoice_code, total, status, event_id) VALUES ($1, 100000, 'paid', $2) RETURNING id",
      [`INV-${testRunId}`, eventA.id]
    );
    resources.orderId = dummyOrder.rows[0].id;

    const dummyDetail = await pool.query(
      "INSERT INTO order_details (order_id, ticket_category_id, quantity, price) VALUES ($1, $2, 1, 100000) RETURNING id",
      [resources.orderId, catA.id]
    );
    resources.orderDetailId = dummyDetail.rows[0].id;

    await pool.query(
      "UPDATE tickets SET order_id = $1, order_detail_id = $2 WHERE id = $3",
      [resources.orderId, resources.orderDetailId, testTicketA1.id]
    );

    // =============================================================
    // 1. PENGUJIAN CHECK-IN TIKET
    // =============================================================
    console.log("\n--- [1] PENGUJIAN CHECK-IN TIKET ---");

    // Skenario 1.1: Petugas BELUM ditugaskan ke Event A
    console.log("Skenario 1.1: Coba check-in saat BELUM ditugaskan ke Event A...");
    let res = createMockRes();
    await checkinController.checkinTicket(
      { user: { id: resources.userId, role: "petugas" }, body: { ticket_code: testTicketA1.ticket_code } },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Message: ${res.data?.message}`);
    if (res.statusCode !== 403) throw new Error("Skenario 1.1 Gagal: Seharusnya ditolak 403 (belum ditugaskan)!");

    // Tugaskan petugas ke Event A dengan permission HANYA ['offline_sales'] (tanpa 'checkin')
    const assignRes = await pool.query(
      "INSERT INTO event_staff (event_id, user_id, is_active) VALUES ($1, $2, true) RETURNING id",
      [eventA.id, resources.userId]
    );
    resources.eventStaffId = assignRes.rows[0].id;
    await pool.query(
      "INSERT INTO event_staff_permissions (event_staff_id, permission) VALUES ($1, 'offline_sales')",
      [resources.eventStaffId]
    );

    // Skenario 1.2: Petugas ditugaskan tapi TANPA permission 'checkin'
    console.log("Skenario 1.2: Coba check-in TANPA permission 'checkin'...");
    res = createMockRes();
    await checkinController.checkinTicket(
      { user: { id: resources.userId, role: "petugas" }, body: { ticket_code: testTicketA1.ticket_code } },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Message: ${res.data?.message}`);
    if (res.statusCode !== 403 || !res.data?.message?.includes("checkin")) {
      throw new Error("Skenario 1.2 Gagal: Seharusnya ditolak 403 (tidak punya izin checkin)!");
    }

    // Tambahkan permission 'checkin'
    await pool.query(
      "INSERT INTO event_staff_permissions (event_staff_id, permission) VALUES ($1, 'checkin')",
      [resources.eventStaffId]
    );

    // Skenario 1.3: Petugas memiliki permission 'checkin'
    console.log("Skenario 1.3: Coba check-in DENGAN permission 'checkin'...");
    res = createMockRes();
    await checkinController.checkinTicket(
      { user: { id: resources.userId, role: "petugas" }, body: { ticket_code: testTicketA1.ticket_code } },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Message: ${res.data?.message}`);
    if (res.statusCode !== 200 || !res.data?.success) {
      throw new Error("Skenario 1.3 Gagal: Check-in seharusnya berhasil 200!");
    }
    if (res.data?.data?.checkin?.id) {
      resources.checkinIds.push(res.data.data.checkin.id);
    }

    // Skenario 1.4: Coba check-in lagi tiket YANG SAMA (Duplicate Check-in)
    console.log("Skenario 1.4: Coba check-in ulang tiket yang sudah 'used' (Duplicate Check-in)...");
    res = createMockRes();
    await checkinController.checkinTicket(
      { user: { id: resources.userId, role: "petugas" }, body: { ticket_code: testTicketA1.ticket_code } },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Message: ${res.data?.message}`);
    if (res.statusCode !== 400 || !res.data?.message?.includes("sudah digunakan")) {
      throw new Error("Skenario 1.4 Gagal: Seharusnya ditolak 400 karena tiket sudah digunakan!");
    }

    // Skenario 1.5: Petugas dinonaktifkan (is_active = false)
    console.log("Skenario 1.5: Nonaktifkan staff (is_active = false) lalu coba check-in...");
    await pool.query("UPDATE event_staff SET is_active = false WHERE id = $1", [resources.eventStaffId]);

    // Buat tiket baru untuk menguji petugas nonaktif
    const tCode2 = `TIX-${testRunId}-2`;
    const tRes2 = await pool.query(
      `INSERT INTO tickets (ticket_code, qr_code, status, order_id, order_detail_id) VALUES ($1, $2, 'active', $3, $4) RETURNING id, ticket_code`,
      [tCode2, tCode2, resources.orderId, resources.orderDetailId]
    );
    const testTicketA2 = tRes2.rows[0];
    resources.ticketIds.push(testTicketA2.id);

    res = createMockRes();
    await checkinController.checkinTicket(
      { user: { id: resources.userId, role: "petugas" }, body: { ticket_code: testTicketA2.ticket_code } },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Message: ${res.data?.message}`);
    if (res.statusCode !== 403 || !res.data?.message?.includes("dinonaktifkan")) {
      throw new Error("Skenario 1.5 Gagal: Seharusnya ditolak 403 karena status petugas dinonaktifkan!");
    }

    // Aktifkan kembali penugasan
    await pool.query("UPDATE event_staff SET is_active = true WHERE id = $1", [resources.eventStaffId]);

    // =============================================================
    // 2. PENGUJIAN RIWAYAT PENGUNJUNG (view_visitors)
    // =============================================================
    console.log("\n--- [2] PENGUJIAN RIWAYAT PENGUNJUNG (view_visitors) ---");

    // Skenario 2.1: Petugas TANPA permission 'view_visitors'
    console.log("Skenario 2.1: Akses riwayat check-in TANPA permission 'view_visitors'...");
    res = createMockRes();
    await checkinController.getEventCheckins(
      { user: { id: resources.userId, role: "petugas" }, params: { eventId: eventA.id } },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Message: ${res.data?.message}`);
    if (res.statusCode !== 403 || !res.data?.message?.includes("view_visitors")) {
      throw new Error("Skenario 2.1 Gagal: Seharusnya ditolak 403 karena tidak ada izin 'view_visitors'!");
    }

    // Tambahkan permission 'view_visitors'
    await pool.query(
      "INSERT INTO event_staff_permissions (event_staff_id, permission) VALUES ($1, 'view_visitors')",
      [resources.eventStaffId]
    );

    // Skenario 2.2: Petugas DENGAN permission 'view_visitors'
    console.log("Skenario 2.2: Akses riwayat check-in DENGAN permission 'view_visitors'...");
    res = createMockRes();
    await checkinController.getEventCheckins(
      { user: { id: resources.userId, role: "petugas" }, params: { eventId: eventA.id } },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Total Checkins: ${res.data?.total}`);
    if (res.statusCode !== 200 || !Array.isArray(res.data?.data)) {
      throw new Error("Skenario 2.2 Gagal: Akses riwayat check-in seharusnya berhasil 200!");
    }

    // =============================================================
    // 3. PENGUJIAN PENJUALAN TIKET OFFLINE (offline_sales)
    // =============================================================
    console.log("\n--- [3] PENGUJIAN PENJUALAN TIKET OFFLINE (offline_sales) ---");

    // Skenario 3.1: Petugas coba jual tiket untuk Event B (Bukan Tanggung Jawab)
    console.log("Skenario 3.1: Jual tiket untuk Event B (di luar tanggung jawab penugasan)...");
    res = createMockRes();
    await offlineSaleController.createOfflineSale(
      {
        user: { id: resources.userId, role: "petugas" },
        body: {
          event_id: eventB.id,
          buyer_name: "Pembeli Ilegal",
          phone: "08123456789",
          ticket_category_id: catA.id,
          quantity: 1,
        },
      },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Message: ${res.data?.message}`);
    if (res.statusCode !== 403) {
      throw new Error("Skenario 3.1 Gagal: Seharusnya ditolak 403 (bukan event tanggung jawab)!");
    }

    // Skenario 3.2: Petugas coba jual tiket Event A saat izin 'offline_sales' dicabut
    console.log("Skenario 3.2: Cabut izin 'offline_sales' lalu coba jual tiket Event A...");
    await pool.query(
      "DELETE FROM event_staff_permissions WHERE event_staff_id = $1 AND permission = 'offline_sales'",
      [resources.eventStaffId]
    );

    res = createMockRes();
    await offlineSaleController.createOfflineSale(
      {
        user: { id: resources.userId, role: "petugas" },
        body: {
          event_id: eventA.id,
          buyer_name: "Pembeli Valid",
          phone: "08123456789",
          ticket_category_id: catA.id,
          quantity: 1,
        },
      },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Message: ${res.data?.message}`);
    if (res.statusCode !== 403 || !res.data?.message?.includes("offline_sales")) {
      throw new Error("Skenario 3.2 Gagal: Seharusnya ditolak 403 (tidak ada izin offline_sales)!");
    }

    // Kembalikan permission 'offline_sales'
    await pool.query(
      "INSERT INTO event_staff_permissions (event_staff_id, permission) VALUES ($1, 'offline_sales')",
      [resources.eventStaffId]
    );

    // Skenario 3.3: Penjualan offline SAH dengan email, payment_method & payment_status
    console.log("Skenario 3.3: Jual tiket offline SAH dengan buyer_email, payment_method & status...");
    const stockBeforeSale = (await pool.query("SELECT stock FROM ticket_categories WHERE id = $1", [catA.id])).rows[0].stock;
    const qtyToBuy = 2;

    res = createMockRes();
    await offlineSaleController.createOfflineSale(
      {
        user: { id: resources.userId, role: "petugas" },
        body: {
          event_id: eventA.id,
          buyer_name: `Budi OTS ${testRunId}`,
          phone: "081122334455",
          buyer_email: `budi_${testRunId}@test.com`,
          payment_method: "qris",
          payment_status: "settlement",
          ticket_category_id: catA.id,
          quantity: qtyToBuy,
        },
      },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Message: ${res.data?.message}`);
    if (res.statusCode !== 201 || !res.data?.data?.sale) {
      throw new Error("Skenario 3.3 Gagal: Penjualan offline seharusnya berhasil 201!");
    }

    // Catat ID dan kuantitas untuk cleanup berbasis delta
    const createdSale = res.data.data.sale;
    resources.offlineSaleIds.push(createdSale.id);
    resources.stockDeductions.push({ categoryId: catA.id, quantity: qtyToBuy });

    if (Array.isArray(res.data.data.tickets)) {
      for (const t of res.data.data.tickets) {
        resources.ticketIds.push(t.id);
      }
    }

    // Verifikasi pemotongan stok secara atomik
    const stockAfterSale = (await pool.query("SELECT stock FROM ticket_categories WHERE id = $1", [catA.id])).rows[0].stock;
    console.log(`  -> Stok Sebelum: ${stockBeforeSale} | Stok Sesudah: ${stockAfterSale} (Delta: -${qtyToBuy})`);
    if (stockAfterSale !== stockBeforeSale - qtyToBuy) {
      throw new Error("Skenario 3.3 Gagal: Stok tiket tidak berkurang secara konsisten!");
    }

    // =============================================================
    // 4. PENGUJIAN DASHBOARD & LAPORAN (view_reports)
    // =============================================================
    console.log("\n--- [4] PENGUJIAN DASHBOARD & LAPORAN (view_reports) ---");

    // Skenario 4.1: Petugas TANPA permission 'view_reports'
    console.log("Skenario 4.1: Akses dashboard laporan TANPA permission 'view_reports'...");
    res = createMockRes();
    await dashboardController.getPetugasDashboard(
      { user: { id: resources.userId, role: "petugas" }, query: {} },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Message: ${res.data?.message}`);
    if (res.statusCode !== 403 || !res.data?.message?.includes("view_reports")) {
      throw new Error("Skenario 4.1 Gagal: Seharusnya ditolak 403 (tidak ada izin view_reports)!");
    }

    // Tambahkan permission 'view_reports'
    await pool.query(
      "INSERT INTO event_staff_permissions (event_staff_id, permission) VALUES ($1, 'view_reports')",
      [resources.eventStaffId]
    );

    // Skenario 4.2: Petugas DENGAN permission 'view_reports'
    console.log("Skenario 4.2: Akses dashboard laporan DENGAN permission 'view_reports'...");
    res = createMockRes();
    await dashboardController.getPetugasDashboard(
      { user: { id: resources.userId, role: "petugas" }, query: {} },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Total Tiket: ${res.data?.data?.total_tickets}, Offline: ${res.data?.data?.offline_tickets}`);
    if (res.statusCode !== 200 || !res.data?.success) {
      throw new Error("Skenario 4.2 Gagal: Akses dashboard petugas seharusnya berhasil 200!");
    }

    // Skenario 4.3: Petugas minta laporan Event B (Bukan Tanggung Jawab) via ?event_id=
    console.log("Skenario 4.3: Minta laporan Event B via ?event_id= (bukan tanggung jawab)...");
    res = createMockRes();
    await dashboardController.getPetugasDashboard(
      { user: { id: resources.userId, role: "petugas" }, query: { event_id: eventB.id } },
      res
    );
    console.log(`  -> Status: ${res.statusCode} | Message: ${res.data?.message}`);
    if (res.statusCode !== 403) {
      throw new Error("Skenario 4.3 Gagal: Seharusnya ditolak 403 untuk event di luar tanggung jawab!");
    }

    console.log(`\n>>> SELURUH SKENARIO OPERATIONAL SECURITY TAHAP 2 BERHASIL! (Run ID: ${testRunId}) <<<`);
  } catch (err) {
    testError = err;
    console.error("\n❌ TEST ERROR TERDETEKSI:", err.message);
  } finally {
    // 1. Jalankan cleanup selektif
    try {
      await performSelectiveCleanup(pool, resources);
    } catch (cErr) {
      cleanupError = cErr;
      console.error("\n❌ CLEANUP ERROR TERDETEKSI:", cErr.message);
    }

    // 2. Tutup koneksi database pool secara graceful setelah seluruh operasi DB selesai
    try {
      await pool.end();
      console.log("[DB] Koneksi database pool telah ditutup dengan aman.");
    } catch (poolErr) {
      console.error("[DB Warning] Gagal menutup koneksi database pool:", poolErr.message);
    }

    // 3. Evaluasi hasil dan tentukan exitCode tanpa terminasi paksa process.exit()
    if (testError || cleanupError) {
      if (testError) console.error("\n[Error Summary] Kegagalan pada skenario testing:", testError.message);
      if (cleanupError) console.error("[Error Summary] Kegagalan pada proses pembersihan data:", cleanupError.message);
      console.log("\n⚠️ Test Run SELESAI DENGAN ERROR. exitCode diset ke 1.\n");
      process.exitCode = 1;
    } else {
      console.log("\n✅ Test Run SELESAI DENGAN SUKSES & BERSIH. exitCode diset ke 0.\n");
      process.exitCode = 0;
    }
  }
}

// Eksekusi test suite
runTahap2TestSuite();

