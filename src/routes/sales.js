const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
const { authenticateToken, requireAdmin, requireClient } = require('../middleware/auth');
const { validate, schemas } = require('../validators');

// Rutas para clientes
router.post('/', authenticateToken, requireClient, validate(schemas.sale), saleController.createSale);
router.get('/my-sales', authenticateToken, requireClient, saleController.getUserSales);
router.get('/:id', authenticateToken, saleController.getSaleDetails);

// Rutas para admin
router.get('/', authenticateToken, requireAdmin, saleController.getAllSales);

module.exports = router;
