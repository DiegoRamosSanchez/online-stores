const { pool } = require('../config/database');

const brandController = {
  // Obtener todas las marcas
  getAllBrands: async (req, res) => {
    try {
      const query = 'SELECT * FROM brands ORDER BY name ASC';
      const result = await pool.query(query);
      
      res.json({
        success: true,
        data: result.rows
      });
      
    } catch (error) {
      console.error('Error obteniendo marcas:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Crear marca (solo admin)
  createBrand: async (req, res) => {
    try {
      const { name } = req.body;
      
      const query = 'INSERT INTO brands (name) VALUES ($1) RETURNING *';
      const result = await pool.query(query, [name]);
      
      res.status(201).json({
        success: true,
        message: 'Marca creada exitosamente',
        data: result.rows[0]
      });
      
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(400).json({
          success: false,
          message: 'La marca ya existe'
        });
      }
      
      console.error('Error creando marca:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Actualizar marca (solo admin)
  updateBrand: async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      
      const query = 'UPDATE brands SET name = $1 WHERE id = $2 RETURNING *';
      const result = await pool.query(query, [name, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Marca no encontrada'
        });
      }
      
      res.json({
        success: true,
        message: 'Marca actualizada exitosamente',
        data: result.rows[0]
      });
      
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(400).json({
          success: false,
          message: 'La marca ya existe'
        });
      }
      
      console.error('Error actualizando marca:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Eliminar marca (solo admin)
  deleteBrand: async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pool.query('DELETE FROM brands WHERE id = $1 RETURNING *', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Marca no encontrada'
        });
      }
      
      res.json({
        success: true,
        message: 'Marca eliminada exitosamente'
      });
      
    } catch (error) {
      console.error('Error eliminando marca:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
};

module.exports = brandController;
