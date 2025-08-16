const { pool } = require('../config/database');
const { supabase } = require('../config/supabase'); // Importar el cliente de Supabase
const { v4: uuidv4 } = require('uuid');
const path = require('path'); // Para obtener la extensión del archivo

// Helper para extraer la ruta del archivo de una URL de Supabase
const getSupabasePath = (url) => {
  if (!url || !url.startsWith(process.env.SUPABASE_URL)) {
    return null;
  }
  // La URL pública de Supabase Storage tiene el formato:
  // [SUPABASE_URL]/storage/v1/object/public/[BUCKET_NAME]/[PATH_IN_BUCKET]
  const parts = url.split(`/storage/v1/object/public/images/`);
  if (parts.length > 1) {
    return parts[1]; // Esto será 'products/uuid_timestamp.ext'
  }
  return null;
};

const productController = {
  // Obtener todos los productos
  getAllProducts: async (req, res) => {
    try {
      const { page = 1, limit = 10, brand_id, search } = req.query;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT p.*, b.name as brand_name
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE 1=1
      `;
      
      const queryParams = [];
      let paramCount = 0;
      
      if (brand_id) {
        paramCount++;
        query += ` AND p.brand_id = $${paramCount}`;
        queryParams.push(brand_id);
      }
      
      if (search) {
        paramCount++;
        query += ` AND (p.model ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
        queryParams.push(`%${search}%`);
      }
      
      query += ` ORDER BY p.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      queryParams.push(limit, offset);
      
      const result = await pool.query(query, queryParams);
      
      // Contar total de productos
      let countQuery = 'SELECT COUNT(*) FROM products p WHERE 1=1';
      const countParams = [];
      let countParamCount = 0;
      
      if (brand_id) {
        countParamCount++;
        countQuery += ` AND p.brand_id = $${countParamCount}`;
        countParams.push(brand_id);
      }
      
      if (search) {
        countParamCount++;
        countQuery += ` AND (p.model ILIKE $${countParamCount} OR p.description ILIKE $${countParamCount})`;
        countParams.push(`%${search}%`);
      }
      
      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);
      
      res.json({
        success: true,
        data: {
          products: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
      
    } catch (error) {
      console.error('Error obteniendo productos:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener producto por ID
  getProductById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        SELECT p.*, b.name as brand_name
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE p.id = $1
      `;
      
      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }
      
      res.json({
        success: true,
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('Error obteniendo producto:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Crear producto (solo admin)
  createProduct: async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { model, description, price, stock, brand_id } = req.body;
      let imageUrlToSave = null;

      // Si se subió un archivo de imagen
      if (req.file) {
        const fileName = `products/${uuidv4()}_${Date.now()}${path.extname(req.file.originalname)}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('images') // Nombre de tu bucket
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false // No sobrescribir si ya existe
          });

        if (uploadError) {
          await client.query('ROLLBACK');
          return res.status(500).json({
            success: false,
            message: 'Error subiendo la imagen del producto',
            details: uploadError.message
          });
        }

        // Obtener la URL pública del archivo
        const { data: urlData } = supabase.storage
          .from('images')
          .getPublicUrl(fileName);

        imageUrlToSave = urlData.publicUrl;
      } else if (req.body.image_url) {
        // Si no se subió un archivo, pero se proporcionó una URL en el body
        imageUrlToSave = req.body.image_url;
      }

      const query = `
        INSERT INTO products (model, description, price, stock, brand_id, image_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const result = await client.query(query, [
        model, description, price, stock, brand_id, imageUrlToSave
      ]);

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Producto creado exitosamente',
        data: result.rows[0]
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creando producto:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    } finally {
      client.release();
    }
  },

  // Actualizar producto (solo admin)
  updateProduct: async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { model, description, price, stock, brand_id } = req.body;
      let imageUrlToSave = req.body.image_url || null; // Por defecto, usa la URL del body si existe

      // Obtener el producto existente para su URL de imagen actual
      const existingProductQuery = 'SELECT image_url FROM products WHERE id = $1';
      const existingProductResult = await client.query(existingProductQuery, [id]);

      if (existingProductResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }
      const oldImageUrl = existingProductResult.rows[0].image_url;

      // Si se subió un nuevo archivo de imagen
      if (req.file) {
        const fileName = `products/${uuidv4()}_${Date.now()}${path.extname(req.file.originalname)}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('images')
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: true // Sobrescribir si el nombre de archivo es el mismo (aunque usamos UUID)
          });

        if (uploadError) {
          await client.query('ROLLBACK');
          return res.status(500).json({
            success: false,
            message: 'Error subiendo la nueva imagen del producto',
            details: uploadError.message
          });
        }

        const { data: urlData } = supabase.storage
          .from('images')
          .getPublicUrl(fileName);

        imageUrlToSave = urlData.publicUrl;

        // Opcional: Eliminar la imagen antigua de Supabase Storage si existía y era de Supabase
        const oldPathInBucket = getSupabasePath(oldImageUrl);
        if (oldPathInBucket) {
          const { error: deleteError } = await supabase.storage
            .from('images')
            .remove([oldPathInBucket]);

          if (deleteError) {
            console.warn('Advertencia: No se pudo eliminar la imagen antigua de Supabase Storage:', deleteError.message);
            // No hacemos rollback, ya que la nueva imagen se subió correctamente
          }
        }
      } else if (!req.body.image_url && oldImageUrl) {
        // Si no se subió un nuevo archivo y el body no tiene image_url, pero había una imagen antigua,
        // significa que se quiere mantener la imagen antigua.
        imageUrlToSave = oldImageUrl;
      } else if (req.body.image_url === '') {
        // Si se envió image_url como cadena vacía, significa que se quiere eliminar la imagen.
        // Eliminar la imagen antigua de Supabase Storage si existía y era de Supabase
        const oldPathInBucket = getSupabasePath(oldImageUrl);
        if (oldPathInBucket) {
          const { error: deleteError } = await supabase.storage
            .from('images')
            .remove([oldPathInBucket]);

          if (deleteError) {
            console.warn('Advertencia: No se pudo eliminar la imagen antigua de Supabase Storage al borrarla:', deleteError.message);
          }
        }
        imageUrlToSave = null; // Establecer a null en la DB
      }
      // Si req.body.image_url tiene una URL válida y no se subió un archivo, se usará esa URL (ya asignada al inicio)


      const query = `
        UPDATE products
        SET model = $1, description = $2, price = $3, stock = $4, brand_id = $5, image_url = $6
        WHERE id = $7
        RETURNING *
      `;

      const result = await client.query(query, [
        model, description, price, stock, brand_id, imageUrlToSave, id
      ]);

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Producto actualizado exitosamente',
        data: result.rows[0]
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error actualizando producto:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    } finally {
      client.release();
    }
  },

  // Eliminar producto (solo admin)
  deleteProduct: async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }
      
      res.json({
        success: true,
        message: 'Producto eliminado exitosamente'
      });
      
    } catch (error) {
      console.error('Error eliminando producto:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
};

module.exports = productController;
