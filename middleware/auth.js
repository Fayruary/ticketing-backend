const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  try {
    // Ambil token dari header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Token tidak ditemukan",
      });
    }


    // Format: Bearer token
    const token = authHeader.split(" ")[1];


    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Format token salah",
      });
    }


    // Verifikasi token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );


    // Simpan data user dari token
    req.user = {
      id: decoded.id,
      name: decoded.name,
      email: decoded.email,
      role: decoded.role,
    };


    next();


  } catch (error) {

    return res.status(401).json({
      success: false,
      message: "Token tidak valid atau sudah expired",
    });

  }
};


module.exports = auth;