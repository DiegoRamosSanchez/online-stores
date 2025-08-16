const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload'); // Importar upload y handleMulterError
const { validate, schemas } = require('../validators');

// Rutas públicas
router.get('/', productController.getAllProducts);
router.get('/:id', productController.getProductById);

// Rutas protegidas (solo admin)
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  upload.single('image'), // Middleware para subir una sola imagen con el nombre 'image'
  handleMulterError, // Manejo de errores de Multer
  validate(schemas.product), // La validación se ejecutará después de la subida
  productController.createProduct
);
router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  upload.single('image'), // Middleware para subir una sola imagen con el nombre 'image'
  handleMulterError, // Manejo de errores de Multer
  validate(schemas.product), // La validación se ejecutará después de la subida
  productController.updateProduct
);
router.delete('/:id', authenticateToken, requireAdmin, productController.deleteProduct);

module.exports = router;
