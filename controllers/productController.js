const pool = require('../config/db');

// 1. ទាញយក Categories ទាំងអស់
exports.getCategories = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY id ASC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// 2. ទាញយក Products ទាំងអស់ (អាច Filter តាម Category បាន)
exports.getProducts = async (req, res) => {
    try {
        const { category_id } = req.query;
        let query = 'SELECT * FROM products';
        let values = [];

        if (category_id) {
            query += ' WHERE category_id = $1';
            values.push(category_id);
        }

        query += ' ORDER BY id DESC';
        const result = await pool.query(query, values);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// 3. បន្ថែម Product ថ្មី
exports.createProduct = async (req, res) => {
    try {
        const { category_id, code, name, price, image_url } = req.body;
        const result = await pool.query(
            `INSERT INTO products (category_id, code, name, price, image_url) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [category_id, code, name, price, image_url]
        );
        res.status(201).json({ success: true, message: 'Product created successfully', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};