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
        const userRole = role || 'Cashier';
        const query = `
            INSERT INTO users (username, password, password_hash, full_name, role) 
            VALUES ($1, $2, $2, $3, $4) RETURNING id, username, full_name, role
        `;
        const values = [username, password, full_name, userRole];
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
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'រកមិនឃើញ Username នេះទេ!' });
        }

        const user = result.rows[0];
        const dbPassword = user.password || user.password_hash;
        if (dbPassword !== password) {
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
        console.error('LOGIN ERROR:', err);
        res.status(500).json({ success: false, error: 'មានបញ្ហាក្នុងការផ្ទៀងផ្ទាត់ Login' });
    }
});

module.exports = router;
```[cite: 7]

### 📌 ជំហានបន្ត៖
1. យកកូដខាងលើទៅជំនួសໃນ File **`routes/users.js`**[cite: 7]។
2. ทำការ **Git Commit & Push** ឡើងទៅកាន់ GitHub ជាការស្រេច[cite: 3]។ 
ពេលនេះ Render នឹង Deploy ឡើងបានជោគជ័យ (Live) ហើយបងអាចបង្កើត User បានធម្មតា! សុំអភ័យទោសផងចំពោះកំហុសឆ្គងអក្សរមុននេះបង!
