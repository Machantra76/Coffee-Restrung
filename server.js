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

// 💡 មុខងារស្វ័យប្រវត្តិបង្កើត Table និង Column ក្នុង Database ពេល Server ចាប់ផ្ដើមដំណើរการ
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
        
        // ធានាថាមាន columns ទាំងពីរ និងដកហូតកម្រិត NOT-Null ដ៏តឹងរ៉ឹងលើ password_hash ចោលបើមាន
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

### 📌 ជំហានបន្ទាប់៖
1. យកកូដខាងលើទៅដាក់ជំនួសក្នុង File **`server.js`** របស់អ្នក[cite: 6]។
2. ทำការ **Git Commit & Push** ឡើងទៅកាន់ GitHub ជាការស្រេច[cite: 3]។ 
3. ពេល Render Deploy រួចរាល់ ឥឡូវនេះបងអាចសាកល្បងចុចបង្កើត User ថ្មីនៅលើ Website របស់អ្នកបានធម្មតា វានឹងមិនចេញ Error 500 ទៀតទេ[cite: 3, 5]!
