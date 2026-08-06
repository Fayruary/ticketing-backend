const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");


// REGISTER
const register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validasi
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Nama, email, dan password wajib diisi",
      });
    }


    // Cek email
    const checkEmail = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );


    if (checkEmail.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Email sudah terdaftar",
      });
    }


    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);


    // Simpan user
    const result = await pool.query(
      `
      INSERT INTO users
      (name, email, phone, password, role)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, name, email, phone, role, created_at
      `,
      [
        name,
        email,
        phone || null,
        hashedPassword,
        "user"
      ]
    );


    res.status(201).json({
      success: true,
      message: "Register berhasil",
      data: result.rows[0],
    });


  } catch (error) {
    console.error("Register Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};



// LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;


    // Cari user
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );


    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }


    const user = result.rows[0];


    // Cek password
    const isMatch = await bcrypt.compare(
      password,
      user.password
    );


    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }


    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );


    res.status(200).json({
      success: true,
      message: "Login berhasil",
      token,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });


  } catch (error) {
    console.error("Login Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};



module.exports = {
  register,
  login,
};