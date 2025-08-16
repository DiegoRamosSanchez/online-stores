const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { supabaseAdmin } = require('../config/supabase');

const authController = {
  // Registro de usuario
  register: async (req, res) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { username, full_name, email, password, role = 'CLIENT' } = req.body;
      
      // Verificar si el usuario ya existe
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );
      
      if (existingUser.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'El usuario o email ya existe'
        });
      }
      
      // Crear usuario en Supabase Auth
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      
      if (authError) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Error al crear usuario en autenticación',
          details: authError.message
        });
      }
      
      // Insertar usuario en la tabla users
      const insertQuery = `
        INSERT INTO users (id, username, full_name, email, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, username, full_name, email, role, created_at
      `;
      
      const result = await client.query(insertQuery, [
        authUser.user.id,
        username,
        full_name,
        email,
        role
      ]);
      
      await client.query('COMMIT');
      
      const user = result.rows[0];
      
      // Generar JWT
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      
      res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente',
        data: {
          user: {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
            created_at: user.created_at
          },
          token
        }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en registro:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    } finally {
      client.release();
    }
  },

  // Login de usuario
  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Autenticar con Supabase
      const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password
      });
      
      if (authError) {
        return res.status(401).json({
          success: false,
          message: 'Credenciales inválidas'
        });
      }
      
      // Obtener datos del usuario desde nuestra tabla
      const userQuery = 'SELECT id, username, full_name, email, role FROM users WHERE id = $1';
      const userResult = await pool.query(userQuery, [authData.user.id]);
      
      if (userResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }
      
      const user = userResult.rows[0];
      
      // Generar JWT
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      
      res.json({
        success: true,
        message: 'Login exitoso',
        data: {
          user,
          token
        }
      });
      
    } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener perfil del usuario
  getProfile: async (req, res) => {
    try {
      const userQuery = `
        SELECT id, username, full_name, email, role, created_at
        FROM users 
        WHERE id = $1
      `;
      
      const result = await pool.query(userQuery, [req.user.id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }
      
      res.json({
        success: true,
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('Error obteniendo perfil:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
};

module.exports = authController;
