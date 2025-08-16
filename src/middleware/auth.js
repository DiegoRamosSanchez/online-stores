const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token de acceso requerido' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar que el usuario existe en la base de datos
    const userQuery = 'SELECT id, username, email, role FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no válido' 
      });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    return res.status(403).json({ 
      success: false, 
      message: 'Token no válido' 
    });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ 
      success: false, 
      message: 'Acceso denegado. Se requieren permisos de administrador' 
    });
  }
  next();
};

const requireClient = (req, res, next) => {
  if (req.user.role !== 'CLIENT') {
    return res.status(403).json({ 
      success: false, 
      message: 'Acceso denegado. Solo para clientes' 
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireClient
};
