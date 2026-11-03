const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const pool = require('./config/db');

// ១. ប្រកាស app ឱ្យបានមុនគេបង្អស់
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // សម្រាប់អាន Folder public (pos.html, login.html)

// 💡 មុខងារស្វ័យប្រវត្តិបង្កើត Table និង Column ក្នុង Database ពេល Server ចាប់ផ្ដើមដំណើរការ
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
        
        // ធានាថាមាន columns ទាំងពីរត្រឹមត្រូវ និងទម្លាក់កម្រិត NOT NULL ចោលលើ password_hash
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);`);
        await pool.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;`).catch(() => {});
        
        console.log('✅ Users table initialized & updated successfully!');
    } catch (err) {
        console.error('❌ Error initializing database table:', err);
    }
}

// ហៅ function បង្កើត Table
initDB();

// ២. ហៅ Routes មកដាក់ពីក្រោម app
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const userRoutes = require('./routes/users'); // ⬅️ បន្ថែម User Routes ទីនេះ

app.use('/api', productRoutes);
app.use('/api', orderRoutes);
app.use('/api/users', userRoutes); // ⬅️ កំណត់ Endpoint សម្រាប់ Users (/api/users)

// Root Route - បង្ហាញទំព័រ login.html មុនគេបង្អស់ពេលចូល Website
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
```[cite: 6]

---

### ២. កូដសម្រាប់ File **`routes/users.js`**
យកកូដនេះទៅជំនួសក្នុង `routes/users.js`[cite: 7]៖

```javascript
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

---

### 📌 ជំហានចុងក្រោយ៖
1. រក្សាទុក (Save) File ทั้งពីរខាងលើ[cite: 6, 7]។
2. ทำការ **Git Commit & Push** ឡើងទៅកាន់ GitHub ជាការស្រេច[cite: 3]។ 
ពេល Render Deploy ជាប់ជោគជ័យ (Live) លើកនេះ វានឹងដំណើរការធម្មតា គ្មាន Error ទៀតទេ។
