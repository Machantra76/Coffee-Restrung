const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ១. ទាញយកបញ្ជី User ទាំងអស់
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY id DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get Users Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// ២. បង្កើត User ថ្មី
router.post('/', async (req, res) => {
    const { username, password, full_name, role } = req.body;
    try {
        const userRole = role || 'Cashier';
        const query = `
            INSERT INTO users (username, password, full_name, role, is_active) 
            VALUES ($1, $2, $3, $4, true) RETURNING id, username, full_name, role, is_active
        `;
        const values = [username, password, full_name, userRole];
        const result = await pool.query(query, values);
        
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Create User Error:', err);
        res.status(500).json({ success: false, error: 'មិនអាចបង្កើត User នេះបានទេ (អាចជាន់ Username)' });
    }
});

// ៣. ផ្លាស់ប្តូរស្ថានភាព Active / UnActive របស់ User
router.patch('/:id/status', async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;
    try {
        await pool.query('UPDATE users SET is_active = $1 WHERE id = $2', [is_active, id]);
        res.json({ success: true, message: 'Updated user status successfully' });
    } catch (err) {
        console.error('Update Status Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// ៤. ផ្ទៀងផ្ទាត់ការ Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'រកមិនឃើញ Username នេះទេ!' });
        }

        const user = result.rows[0];
        
        if (user.is_active === false) {
            return res.status(403).json({ success: false, error: 'គណនីនេះត្រូវបានផ្អាកដំណើរការ (UnActive)!' });
        }

        if (user.password !== password) {
            return res.status(400).json({ success: false, error: 'ពាក្យសម្ងាត់ (Password) មិនត្រឹមត្រូវទេ!' });
        }

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
        console.error('Login Error:', err);
        res.status(500).json({ success: false, error: 'មានបញ្ហាក្នុងការផ្ទៀងផ្ទាត់ Login' });
    }
});

module.exports = router;
