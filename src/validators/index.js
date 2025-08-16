const Joi = require('joi');

const schemas = {
  // Validación para registro de usuario
  userRegistration: Joi.object({
    username: Joi.string().alphanum().min(3).max(50).required(),
    full_name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('ADMIN', 'CLIENT').default('CLIENT')
  }),

  // Validación para login
  userLogin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  // Validación para productos
  product: Joi.object({
    model: Joi.string().max(100).required(),
    description: Joi.string().allow('').default(null), // Permitir cadena vacía o null
    price: Joi.number().positive().precision(2).required(),
    stock: Joi.number().integer().min(0).default(0),
    brand_id: Joi.number().integer().positive().required(),
    image_url: Joi.string().uri().allow(null, '') // Permitir URL, null o cadena vacía
  }),

  // Validación para marcas
  brand: Joi.object({
    name: Joi.string().max(50).required()
  }),

  // Validación para ventas
  sale: Joi.object({
    products: Joi.array().items(
      Joi.object({
        product_id: Joi.number().integer().positive().required(),
        quantity: Joi.number().integer().positive().required()
      })
    ).min(1).required()
  }),

  // Validación para pagos
  payment: Joi.object({
    sale_id: Joi.string().uuid().required(),
    amount: Joi.number().positive().precision(2).required(),
    method: Joi.string().valid('YAPE', 'PLIN', 'EFECTIVO', 'TARJETA').required()
  }),

  // Validación para actualizar estado de pago
  paymentStatus: Joi.object({
    status: Joi.string().valid('PENDING', 'APPROVED', 'REJECTED').required()
  })
};

const validate = (schema) => {
  return (req, res, next) => {
    // Para Joi, los archivos subidos por Multer no están en req.body
    // Solo validamos los campos que vienen en el body
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada no válidos',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

module.exports = {
  schemas,
  validate
};
