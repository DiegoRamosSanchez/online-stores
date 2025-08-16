const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validate, schemas } = require('../validators');

// Rutas públicas
router.get('/', brandController.getAllBrands);

// Rutas protegidas (solo admin)
router.post('/', authenticateToken, requireAdmin, validate(schemas.brand), brandController.createBrand);
router.put('/:id', authenticateToken, requireAdmin, validate(schemas.brand), brandController.updateBrand);
router.delete('/:id', authenticateToken, requireAdmin, brandController.deleteBrand);

module.exports = router;
