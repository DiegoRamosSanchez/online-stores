const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken, requireAdmin, requireClient } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');
const { validate, schemas } = require('../validators');

// Rutas para clientes
router.post('/upload-voucher', 
  authenticateToken, 
  requireClient, 
  upload.single('voucher'),
  handleMulterError,
  validate(schemas.payment),
  paymentController.uploadPaymentVoucher
);

// Rutas para admin
router.get('/pending', authenticateToken, requireAdmin, paymentController.getPendingPayments);
router.get('/history', authenticateToken, requireAdmin, paymentController.getPaymentHistory);
router.put('/:id/status', 
  authenticateToken, 
  requireAdmin, 
  validate(schemas.paymentStatus), 
  paymentController.updatePaymentStatus
);

module.exports = router;
