const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255),
                password_hash VARCHAR(255),
                full_name VARCHAR(150) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'Cashier',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // ធានាថាមាន columns ទាំងពីរ និងទម្លាក់ NOT NULL constraint លើ password_hash ចោល
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);`);
        await pool.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;`).catch(() => {});
        
        console.log('✅ Users table initialized successfully!');
    } catch (err) {
        console.error('❌ Error initializing database table:', err);
    }
}

initDB();

const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const userRoutes = require('./routes/users');

app.use('/api', productRoutes);
app.use('/api', orderRoutes);
app.use('/api/users', userRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
```[cite: 10]

---

### ២. កូដសម្រាប់ File **`routes/users.js`**
```javascript
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, full_name, role, created_at FROM users ORDER BY id DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

router.post('/', async (req, res) => {
    const { username, password, full_name, role } = req.body;
    try {
        const userRole = role || 'Cashier';
        // បញ្ចូលទាំង password និង password_hash ព្រមគ្នាដើម្បីការពារ Not-Null Constraint Error
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
