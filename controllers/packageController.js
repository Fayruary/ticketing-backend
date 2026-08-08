const pool = require("../config/db");

// GET semua package
const getAllPackages = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM cooperation_packages
      ORDER BY id ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil package"
    });
  }
};

// GET package
const getPackageById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM cooperation_packages WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Package tidak ditemukan"
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil package"
    });
  }
};

// CREATE
const createPackage = async (req, res) => {
  try {
    const {
      name,
      duration,
      price,
      description
    } = req.body;

    if (!name || !duration || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "Name, duration, dan price wajib diisi"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO cooperation_packages
      (name, duration, price, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        name,
        duration,
        price,
        description || null
      ]
    );

    res.status(201).json({
      success: true,
      message: "Package berhasil ditambahkan",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menambahkan package"
    });
  }
};

// UPDATE
const updatePackage = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      duration,
      price,
      description
    } = req.body;

    const result = await pool.query(
      `
      UPDATE cooperation_packages
      SET
        name = COALESCE($1, name),
        duration = COALESCE($2, duration),
        price = COALESCE($3, price),
        description = COALESCE($4, description)
      WHERE id = $5
      RETURNING *
      `,
      [
        name,
        duration,
        price,
        description,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Package tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Package berhasil diperbarui",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui package"
    });
  }
};

// DELETE
const deletePackage = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM cooperation_packages
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Package tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Package berhasil dihapus"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus package"
    });
  }
};

module.exports = {
  getAllPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage
};