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

// ៣. API សម្រាប់ Login ចូលប្រើប្រាស់ប្រព័ន្ធ
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // ស្វែងរក User តាមរយៈ username
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'រកមិនឃើញ Username នេះទេ!' });
        }

        const user = result.rows[0];

        // ផ្ទៀងផ្ទាត់ Password (ផ្ទៀងផ្ទាត់ជាមួយ column password_hash ឬ password)
        const dbPassword = user.password_hash || user.password;
        if (dbPassword !== password) {
            return res.status(400).json({ success: false, error: 'ពាក្យសម្ងាត់ (Password) មិនត្រឹមត្រូវទេ!' });
        }

        // Login ជោគជ័យ - បញ្ជូនព័ត៌មាន User ត្រឡប់ទៅ Frontend
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role
            }
        });
    } catch (err) {
        console.error('LOGIN ERROR:', err);
        res.status(500).json({ success: false, error: 'មានបញ្ហាក្នុងការផ្ទៀងផ្ទាត់ Login' });
    }
});

module.exports = router;
