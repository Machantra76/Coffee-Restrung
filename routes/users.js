const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// ១. ទាញយកបញ្ជី User ទាំងអស់
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, full_name, role, created_at FROM users ORDER BY id DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// ២. បង្កើត User ថ្មី
router.post('/', async (req, res) => {
    const { username, password, full_name, role } = req.body;
    try {
        const query = `
            INSERT INTO users (username, password, full_name, role) 
            VALUES ($1, $2, $3, $4) RETURNING id, username, full_name, role
        `;
        const values = [username, password, full_name, role || 'Cashier'];
        const result = await pool.query(query, values);
        
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'មិនអាចបង្កើត User នេះបានទេ (អាចជាន់ Username)' });
    }
});

module.exports = router;