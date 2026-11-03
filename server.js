const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./config/db');

// ១. ប្រកាស app ឱ្យបានមុនគេបង្អស់
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // សម្រាប់អាន Folder public (pos.html)

// 💡 មុខងារស្វ័យប្រវត្តិបង្កើត Table ក្នុង Database ពេល Server ចាប់ផ្ដើមដំណើរការ
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255),
                full_name VARCHAR(150) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'Cashier',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // ធានាថាមាន column password ស្រាប់ ទោះតារាងមានមុនក៏ដោយ
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);`);
        console.log('✅ Users table initialized successfully!');
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

// Test Route
app.get('/', (req, res) => {
    res.json({ success: true, message: 'Café & Restaurant POS API is running smoothly!' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
