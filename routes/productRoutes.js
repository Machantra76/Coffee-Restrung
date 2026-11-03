const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

router.get('/categories', productController.getCategories);
router.get('/products', productController.getProducts);
router.post('/products', productController.createProduct);

routes = router;
module.exports = routes;