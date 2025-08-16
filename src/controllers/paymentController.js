const { pool } = require('../config/database');
const { supabase } = require('../config/supabase');

const paymentController = {
  // Subir comprobante de pago
  uploadPaymentVoucher: async (req, res) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { sale_id, amount, method } = req.body;
      const userId = req.user.id;
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere subir un comprobante de pago'
        });
      }
      
      // Verificar que la venta pertenece al usuario
      const saleQuery = 'SELECT * FROM sales WHERE id = $1 AND user_id = $2';
      const saleResult = await client.query(saleQuery, [sale_id, userId]);
      
      if (saleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Venta no encontrada'
        });
      }
      
      const sale = saleResult.rows[0];
      
      // Verificar que el monto coincide con el total de la venta
      if (parseFloat(amount) !== parseFloat(sale.total)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `El monto del pago (${amount}) no coincide con el total de la venta (${sale.total})`
        });
      }
      
      // Subir archivo a Supabase Storage
      const fileName = `vouchers/${sale_id}_${Date.now()}_${req.file.originalname}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });
      
      if (uploadError) {
        await client.query('ROLLBACK');
        return res.status(500).json({
          success: false,
          message: 'Error subiendo el comprobante',
          details: uploadError.message
        });
      }
      
      // Obtener URL pública del archivo
      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(fileName);
      
      // Verificar si ya existe un pago para esta venta
      const existingPaymentQuery = 'SELECT id FROM payments WHERE sale_id = $1';
      const existingPaymentResult = await client.query(existingPaymentQuery, [sale_id]);
      
      let paymentResult;
      
      if (existingPaymentResult.rows.length > 0) {
        // Actualizar pago existente
        const updatePaymentQuery = `
          UPDATE payments 
          SET amount = $1, method = $2, voucher_url = $3, status = 'PENDING', uploaded_at = NOW()
          WHERE sale_id = $4
          RETURNING *
        `;
        
        paymentResult = await client.query(updatePaymentQuery, [
          amount, method, urlData.publicUrl, sale_id
        ]);
      } else {
        // Crear nuevo pago
        const insertPaymentQuery = `
          INSERT INTO payments (sale_id, amount, method, voucher_url, status)
          VALUES ($1, $2, $3, $4, 'PENDING')
          RETURNING *
        `;
        
        paymentResult = await client.query(insertPaymentQuery, [
          sale_id, amount, method, urlData.publicUrl
        ]);
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({
        success: true,
        message: 'Comprobante de pago subido exitosamente',
        data: paymentResult.rows[0]
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error subiendo comprobante:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    } finally {
      client.release();
    }
  },

  // Obtener pagos pendientes (solo admin)
  getPendingPayments: async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;
      
      const query = `
        SELECT p.*, s.total as sale_total, s.created_at as sale_date,
               u.username, u.full_name, u.email
        FROM payments p
        JOIN sales s ON p.sale_id = s.id
        JOIN users u ON s.user_id = u.id
        WHERE p.status = 'PENDING'
        ORDER BY p.uploaded_at DESC
        LIMIT $1 OFFSET $2
      `;
      
      const result = await pool.query(query, [limit, offset]);
      
      res.json({
        success: true,
        data: result.rows
      });
      
    } catch (error) {
      console.error('Error obteniendo pagos pendientes:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Aprobar o rechazar pago (solo admin)
  updatePaymentStatus: async (req, res) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { id } = req.params;
      const { status } = req.body;
      
      // Actualizar estado del pago
      const updatePaymentQuery = `
        UPDATE payments 
        SET status = $1
        WHERE id = $2
        RETURNING *
      `;
      
      const paymentResult = await client.query(updatePaymentQuery, [status, id]);
      
      if (paymentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Pago no encontrado'
        });
      }
      
      const payment = paymentResult.rows[0];
      
      // Si el pago es aprobado, actualizar estado de la venta
      if (status === 'APPROVED') {
        const updateSaleQuery = `
          UPDATE sales 
          SET status = 'PAID'
          WHERE id = $1
        `;
        
        await client.query(updateSaleQuery, [payment.sale_id]);
      } else if (status === 'REJECTED') {
        // Si el pago es rechazado, restaurar stock y cancelar venta
        const restoreStockQuery = `
          UPDATE products 
          SET stock = stock + sd.quantity
          FROM sale_details sd
          WHERE products.id = sd.product_id AND sd.sale_id = $1
        `;
        
        await client.query(restoreStockQuery, [payment.sale_id]);
        
        const updateSaleQuery = `
          UPDATE sales 
          SET status = 'CANCELLED'
          WHERE id = $1
        `;
        
        await client.query(updateSaleQuery, [payment.sale_id]);
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: `Pago ${status === 'APPROVED' ? 'aprobado' : 'rechazado'} exitosamente`,
        data: payment
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error actualizando estado de pago:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    } finally {
      client.release();
    }
  },

  // Obtener historial de pagos
  getPaymentHistory: async (req, res) => {
    try {
      const { page = 1, limit = 10, status } = req.query;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT p.*, s.total as sale_total, s.created_at as sale_date,
               u.username, u.full_name, u.email
        FROM payments p
        JOIN sales s ON p.sale_id = s.id
        JOIN users u ON s.user_id = u.id
        WHERE 1=1
      `;
      
      const queryParams = [];
      let paramCount = 0;
      
      if (status) {
        paramCount++;
        query += ` AND p.status = $${paramCount}`;
        queryParams.push(status);
      }
      
      query += ` ORDER BY p.uploaded_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      queryParams.push(limit, offset);
      
      const result = await pool.query(query, queryParams);
      
      res.json({
        success: true,
        data: result.rows
      });
      
    } catch (error) {
      console.error('Error obteniendo historial de pagos:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
};

module.exports = paymentController;
