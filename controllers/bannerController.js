const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

// GET semua banner (Admin)
const getAllBanners = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, image, is_active, COALESCE(link_url, '') AS link_url
      FROM banners
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error("getAllBanners error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil banner"
    });
  }
};

// GET banner aktif (Public untuk Tampilan User)
const getActiveBanners = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, image, is_active, COALESCE(link_url, '') AS link_url
      FROM banners
      WHERE is_active = true
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error("getActiveBanners error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil banner aktif"
    });
  }
};

// CREATE banner baru
const createBanner = async (req, res) => {
  try {
    let { title, image, is_active, link_url } = req.body;

    // Jika upload file via multer
    if (req.file) {
      image = `/uploads/banners/${req.file.filename}`;
    }

    if (!title || !image) {
      return res.status(400).json({
        success: false,
        message: "Judul dan gambar banner wajib diisi"
      });
    }

    const isActiveBool =
      is_active === undefined || is_active === null
        ? true
        : String(is_active) === "true" || is_active === true;

    const result = await pool.query(
      `
      INSERT INTO banners
      (title, image, is_active, link_url)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [title, image, isActiveBool, link_url || "/events"]
    );

    res.status(201).json({
      success: true,
      message: "Banner berhasil ditambahkan",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("createBanner error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menambahkan banner"
    });
  }
};

// UPDATE banner
const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    let { title, image, is_active, link_url } = req.body;

    if (req.file) {
      image = `/uploads/banners/${req.file.filename}`;
    }

    let isActiveBool = undefined;
    if (is_active !== undefined && is_active !== null) {
      isActiveBool = String(is_active) === "true" || is_active === true;
    }

    const result = await pool.query(
      `
      UPDATE banners
      SET
        title = COALESCE($1, title),
        image = COALESCE($2, image),
        is_active = COALESCE($3, is_active),
        link_url = COALESCE($4, link_url)
      WHERE id = $5
      RETURNING *
      `,
      [title || null, image || null, isActiveBool, link_url || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Banner tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Banner berhasil diperbarui",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("updateBanner error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui banner"
    });
  }
};

// TOGGLE status aktif banner
const toggleBannerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE banners
      SET is_active = NOT is_active
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Banner tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: `Status banner diubah menjadi ${result.rows[0].is_active ? "Aktif" : "Nonaktif"}`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error("toggleBannerStatus error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengubah status banner"
    });
  }
};

// UPLOAD gambar banner (opsional untuk instant preview upload)
const uploadBannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File gambar tidak ditemukan"
      });
    }

    const fileUrl = `/uploads/banners/${req.file.filename}`;

    res.json({
      success: true,
      message: "Gambar banner berhasil diunggah",
      url: fileUrl
    });
  } catch (error) {
    console.error("uploadBannerImage error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengunggah gambar"
    });
  }
};

// DELETE banner
const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    // Ambil data banner sebelum dihapus untuk cleanup file lokal
    const existing = await pool.query(`SELECT image FROM banners WHERE id = $1`, [id]);

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Banner tidak ditemukan"
      });
    }

    const imagePath = existing.rows[0].image;

    await pool.query(`DELETE FROM banners WHERE id = $1`, [id]);

    // Hapus file lokal jika tersimpan di uploads/banners
    if (imagePath && imagePath.startsWith("/uploads/banners/")) {
      const fullDiskPath = path.join(__dirname, "..", imagePath);
      if (fs.existsSync(fullDiskPath)) {
        try {
          fs.unlinkSync(fullDiskPath);
        } catch (cleanupErr) {
          console.warn("Gagal menghapus file gambar lama:", cleanupErr.message);
        }
      }
    }

    res.json({
      success: true,
      message: "Banner berhasil dihapus"
    });
  } catch (error) {
    console.error("deleteBanner error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus banner"
    });
  }
};

module.exports = {
  getAllBanners,
  getActiveBanners,
  createBanner,
  updateBanner,
  toggleBannerStatus,
  uploadBannerImage,
  deleteBanner
};
