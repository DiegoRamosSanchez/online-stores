const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const saleController = {
  // Crear nueva venta
  createSale: async (req, res) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { products } = req.body;
      const userId = req.user.id;
      
      // Verificar stock y calcular total
      let total = 0;
      const saleProducts = [];
      
      for (const item of products) {
        const productQuery = 'SELECT id, model, price, stock FROM products WHERE id = $1';
        const productResult = await client.query(productQuery, [item.product_id]);
        
        if (productResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Producto con ID ${item.product_id} no encontrado`
          });
        }
        
        const product = productResult.rows[0];
        
        if (product.stock < item.quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Stock insuficiente para ${product.model}. Stock disponible: ${product.stock}`
          });
        }
        
        const subtotal = product.price * item.quantity;
        total += subtotal;
        
        saleProducts.push({
          product_id: item.product_id,
          quantity: item.quantity,
          price: product.price,
          subtotal
        });
      }
      
      // Crear la venta
      const saleId = uuidv4();
      const saleQuery = `
        INSERT INTO sales (id, user_id, total, status)
        VALUES ($1, $2, $3, 'PENDING')
        RETURNING *
      `;
      
      const saleResult = await client.query(saleQuery, [saleId, userId, total]);
      
      // Insertar detalles de la venta
      for (const item of saleProducts) {
        const detailQuery = `
          INSERT INTO sale_details (sale_id, product_id, quantity, price)
          VALUES ($1, $2, $3, $4)
        `;
        
        await client.query(detailQuery, [
          saleId,
          item.product_id,
          item.quantity,
          item.price
        ]);
        
        // Actualizar stock
        const updateStockQuery = 'UPDATE products SET stock = stock - $1 WHERE id = $2';
        await client.query(updateStockQuery, [item.quantity, item.product_id]);
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({
        success: true,
        message: 'Venta creada exitosamente',
        data: {
          sale: saleResult.rows[0],
          products: saleProducts
        }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creando venta:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    } finally {
      client.release();
    }
  },

  // Obtener ventas del usuario
  getUserSales: async (req, res) => {
    try {
      const { page = 1, limit = 10, status } = req.query;
      const offset = (page - 1) * limit;
      const userId = req.user.id;
      
      let query = `
        SELECT s.*, 
               COUNT(sd.id) as items_count,
               COALESCE(p.status, 'NO_PAYMENT') as payment_status
        FROM sales s
        LEFT JOIN sale_details sd ON s.id = sd.sale_id
        LEFT JOIN payments p ON s.id = p.sale_id
        WHERE s.user_id = $1
      `;
      
      const queryParams = [userId];
      let paramCount = 1;
      
      if (status) {
        paramCount++;
        query += ` AND s.status = $${paramCount}`;
        queryParams.push(status);
      }
      
      query += ` GROUP BY s.id, p.status ORDER BY s.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      queryParams.push(limit, offset);
      
      const result = await pool.query(query, queryParams);
      
      res.json({
        success: true,
        data: result.rows
      });
      
    } catch (error) {
      console.error('Error obteniendo ventas:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener detalles de una venta
  getSaleDetails: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Verificar que la venta pertenece al usuario o es admin
      let saleQuery = `
        SELECT s.*, u.username, u.full_name, u.email
        FROM sales s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = $1
      `;
      
      const queryParams = [id];
      
      if (req.user.role !== 'ADMIN') {
        saleQuery += ' AND s.user_id = $2';
        queryParams.push(userId);
      }
      
      const saleResult = await pool.query(saleQuery, queryParams);
      
      if (saleResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Venta no encontrada'
        });
      }
      
      // Obtener detalles de productos
      const detailsQuery = `
        SELECT sd.*, p.model, p.description, b.name as brand_name
        FROM sale_details sd
        JOIN products p ON sd.product_id = p.id
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE sd.sale_id = $1
      `;
      
      const detailsResult = await pool.query(detailsQuery, [id]);
      
      // Obtener información de pago
      const paymentQuery = 'SELECT * FROM payments WHERE sale_id = $1';
      const paymentResult = await pool.query(paymentQuery, [id]);
      
      res.json({
        success: true,
        data: {
          sale: saleResult.rows[0],
          details: detailsResult.rows,
          payment: paymentResult.rows[0] || null
        }
      });
      
    } catch (error) {
      console.error('Error obteniendo detalles de venta:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener todas las ventas (solo admin)
  getAllSales: async (req, res) => {
    try {
      const { page = 1, limit = 10, status, user_id } = req.query;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT s.*, u.username, u.full_name, u.email,
               COUNT(sd.id) as items_count,
               COALESCE(p.status, 'NO_PAYMENT') as payment_status
        FROM sales s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN sale_details sd ON s.id = sd.sale_id
        LEFT JOIN payments p ON s.id = p.sale_id
        WHERE 1=1
      `;
      
      const queryParams = [];
      let paramCount = 0;
      
      if (status) {
        paramCount++;
        query += ` AND s.status = $${paramCount}`;
        queryParams.push(status);
      }
      
      if (user_id) {
        paramCount++;
        query += ` AND s.user_id = $${paramCount}`;
        queryParams.push(user_id);
      }
      
      query += ` GROUP BY s.id, u.username, u.full_name, u.email, p.status ORDER BY s.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      queryParams.push(limit, offset);
      
      const result = await pool.query(query, queryParams);
      
      res.json({
        success: true,
        data: result.rows
      });
      
    } catch (error) {
      console.error('Error obteniendo todas las ventas:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
};

module.exports = saleController;
