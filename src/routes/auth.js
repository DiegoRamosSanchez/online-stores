const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../validators');

// Rutas públicas
router.post('/register', validate(schemas.userRegistration), authController.register);
router.post('/login', validate(schemas.userLogin), authController.login);

// Rutas protegidas
router.get('/profile', authenticateToken, authController.getProfile);

module.exports = router;
