const pool = require("../config/db");

const getAllBanners = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM banners
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil banner"
    });
  }
};

const getActiveBanners = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM banners
      WHERE is_active = true
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil banner aktif"
    });
  }
};

const createBanner = async (req, res) => {
  try {
    const {
      title,
      image,
      is_active
    } = req.body;

    if (!title || !image) {
      return res.status(400).json({
        success: false,
        message: "Title dan image wajib diisi"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO banners
      (title, image, is_active)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [
        title,
        image,
        is_active !== undefined ? is_active : true
      ]
    );

    res.status(201).json({
      success: true,
      message: "Banner berhasil ditambahkan",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menambahkan banner"
    });
  }
};

const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      image,
      is_active
    } = req.body;

    const result = await pool.query(
      `
      UPDATE banners
      SET
        title = COALESCE($1, title),
        image = COALESCE($2, image),
        is_active = COALESCE($3, is_active)
      WHERE id = $4
      RETURNING *
      `,
      [title, image, is_active, id]
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
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui banner"
    });
  }
};

const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM banners WHERE id = $1 RETURNING id`,
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
      message: "Banner berhasil dihapus"
    });
  } catch (error) {
    console.error(error);
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
  deleteBanner
};