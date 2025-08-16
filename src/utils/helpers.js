const generateOrderNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${timestamp.slice(-6)}-${random}`;
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN'
  }).format(amount);
};

const validateFileType = (mimetype) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  return allowedTypes.includes(mimetype);
};

const generateFileName = (originalName) => {
  const timestamp = Date.now();
  const extension = originalName.split('.').pop();
  const randomString = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomString}.${extension}`;
};

module.exports = {
  generateOrderNumber,
  formatCurrency,
  validateFileType,
  generateFileName
};
