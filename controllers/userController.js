const pool = require("../config/db");


// GET PROFILE USER LOGIN
const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, name, email, phone, role, created_at
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );


    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }


    res.json({
      success: true,
      data: result.rows[0],
    });


  } catch (error) {
    console.error("Get Profile Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};




// GET ALL USERS (ADMIN)
const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, name, email, phone, role, created_at
      FROM users
      ORDER BY created_at DESC
      `
    );


    res.json({
      success: true,
      total: result.rows.length,
      data: result.rows,
    });


  } catch (error) {
    console.error("Get Users Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};




// UPDATE PROFILE
const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;


    const result = await pool.query(
      `
      UPDATE users
      SET name = $1,
          phone = $2,
          updated_at = now()
      WHERE id = $3
      RETURNING id, name, email, phone, role
      `,
      [
        name,
        phone,
        req.user.id
      ]
    );


    res.json({
      success: true,
      message: "Profile berhasil diperbarui",
      data: result.rows[0],
    });


  } catch (error) {
    console.error("Update Profile Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};




// DELETE USER (ADMIN)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;


    const result = await pool.query(
      `
      DELETE FROM users
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );


    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }


    res.json({
      success: true,
      message: "User berhasil dihapus",
    });


  } catch (error) {
    console.error("Delete User Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};



module.exports = {
  getProfile,
  getAllUsers,
  updateProfile,
  deleteUser,
};