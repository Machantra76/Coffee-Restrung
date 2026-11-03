const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// តភ្ជាប់ជាមួយ Cloud Database (Neon PostgreSQL) តាមរយៈ DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// មុខងារបង្កើតតារាង Database ស្វ័យប្រវត្តិពេលចាប់ផ្តើម Server
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                full_name VARCHAR(150) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'Cashier',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                cashier_id INT REFERENCES users(id),
                total_amount NUMERIC(10, 2) NOT NULL,
                payment_method VARCHAR(50) DEFAULT 'Cash',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // បម្រុងទុកกรณีតារាង users មានរួចហើយ ប៉ុន្តែអត់ទាន់មាន column is_active
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        `);

        console.log('✅ Database tables (users & orders) initialized successfully on Cloud!');
    } catch (err) {
        console.error('❌ Database initialization error:', err);
    }
}

initDB();

// នាំយក User Routes មកប្រើប្រាស់
const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);

// Root Route - បង្ហាញទំព័រ Login មុនគេ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
