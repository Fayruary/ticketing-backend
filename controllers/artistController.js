const pool = require("../config/db");

// GET semua artist
const getAllArtists = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM artists
      ORDER BY name ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data artist"
    });
  }
};

// GET artist berdasarkan ID
const getArtistById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM artists WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Artist tidak ditemukan"
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
      message: "Gagal mengambil artist"
    });
  }
};

// CREATE artist
const createArtist = async (req, res) => {
  try {
    const { name, photo } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama artist wajib diisi"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO artists (name, photo)
      VALUES ($1, $2)
      RETURNING *
      `,
      [name, photo || null]
    );

    res.status(201).json({
      success: true,
      message: "Artist berhasil ditambahkan",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menambahkan artist"
    });
  }
};

// UPDATE artist
const updateArtist = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, photo } = req.body;

    const result = await pool.query(
      `
      UPDATE artists
      SET name = COALESCE($1, name),
          photo = COALESCE($2, photo)
      WHERE id = $3
      RETURNING *
      `,
      [name, photo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Artist tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Artist berhasil diperbarui",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui artist"
    });
  }
};

// DELETE artist
const deleteArtist = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM artists WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Artist tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "Artist berhasil dihapus"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus artist"
    });
  }
};

// Tambahkan artist ke event
const addArtistToEvent = async (req, res) => {
  try {
    const { eventId, artistId } = req.body;

    const result = await pool.query(
      `
      INSERT INTO event_artists (event_id, artist_id)
      VALUES ($1, $2)
      RETURNING *
      `,
      [eventId, artistId]
    );

    res.status(201).json({
      success: true,
      message: "Artist berhasil ditambahkan ke event",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Artist sudah terdaftar di event tersebut"
      });
    }

    res.status(500).json({
      success: false,
      message: "Gagal menambahkan artist ke event"
    });
  }
};

// GET artist dalam event
const getEventArtists = async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await pool.query(
      `
      SELECT
        a.id,
        a.name,
        a.photo
      FROM event_artists ea
      JOIN artists a ON a.id = ea.artist_id
      WHERE ea.event_id = $1
      ORDER BY a.name ASC
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
      message: "Gagal mengambil artist event"
    });
  }
};

// Hapus artist dari event
const removeArtistFromEvent = async (req, res) => {
  try {
    const { eventId, artistId } = req.params;

    const result = await pool.query(
      `
      DELETE FROM event_artists
      WHERE event_id = $1
      AND artist_id = $2
      RETURNING *
      `,
      [eventId, artistId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Artist tidak ditemukan di event"
      });
    }

    res.json({
      success: true,
      message: "Artist berhasil dihapus dari event"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus artist dari event"
    });
  }
};

module.exports = {
  getAllArtists,
  getArtistById,
  createArtist,
  updateArtist,
  deleteArtist,
  addArtistToEvent,
  getEventArtists,
  removeArtistFromEvent
};