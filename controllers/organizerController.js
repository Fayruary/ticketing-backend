const pool = require("../config/db");

// GET semua organizer
const getAllOrganizers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM organizers
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil organizer"
    });
  }
};

// GET organizer
const getOrganizerById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM organizers WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Organizer tidak ditemukan"
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
      message: "Gagal mengambil organizer"
    });
  }
};

// CREATE
const createOrganizer = async (req, res) => {
  try {
    const {
      name,
      company_name,
      email,
      phone,
      address
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama organizer wajib diisi"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO organizers
      (name, company_name, email, phone, address)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        name,
        company_name || null,
        email || null,
        phone || null,
        address || null
      ]
    );

    res.status(201).json({
      success: true,
      message: "Organizer berhasil ditambahkan",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menambahkan organizer"
    });
  }
};

// UPDATE
const updateOrganizer = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      company_name,
      email,
      phone,
      address
    } = req.body;

    const result = await pool.query(
      `
      UPDATE organizers
      SET
        name = COALESCE($1, name),
        company_name = COALESCE($2, company_name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        address = COALESCE($5, address),
        updated_at = now()
      WHERE id = $6
      RETURNING *
      `,
      [
        name,
        company_name,
        email,
        phone,
        address,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Organizer tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Organizer berhasil diperbarui",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui organizer"
    });
  }
};

// DELETE
const deleteOrganizer = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM organizers WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Organizer tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Organizer berhasil dihapus"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus organizer"
    });
  }
};

module.exports = {
  getAllOrganizers,
  getOrganizerById,
  createOrganizer,
  updateOrganizer,
  deleteOrganizer
};