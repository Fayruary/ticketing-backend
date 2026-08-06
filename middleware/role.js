    const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      // Cek apakah user sudah melewati auth middleware
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "User belum login",
        });
      }


      // Ambil role user dari JWT
      const userRole = req.user.role;


      // Cek apakah role user diizinkan
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: "Akses ditolak, role tidak memiliki izin",
        });
      }


      // Lanjut ke controller
      next();


    } catch (error) {
      console.error("Role Middleware Error:", error);

      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  };
};


module.exports = checkRole;