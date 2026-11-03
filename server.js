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

// API សម្រាប់ទាញយកបញ្ជី Cashier ទាំងអស់ (សម្រាប់ Admin ជ្រើសរើសមើល)
app.get('/api/users/cashiers-list', async (req, res) => {
    try {
        const result = await pool.query("SELECT id, full_name, username FROM users WHERE role = 'Cashier' AND is_active = true");
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get Cashiers Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// API សម្រាប់ទាញយករបាយការណ៍សកម្មភាពលក់របស់ Cashier ម្នាក់ៗ
app.get('/api/orders/cashier-activity/:cashierId', async (req, res) => {
    const { cashierId } = req.params;
    try {
        const ordersResult = await pool.query(
            'SELECT id, total_amount, payment_method, created_at FROM orders WHERE cashier_id = $1 ORDER BY id DESC',
            [cashierId]
        );

        const sumResult = await pool.query(
            'SELECT COUNT(id) as total_bills, SUM(total_amount) as grand_total FROM orders WHERE cashier_id = $1',
            [cashierId]
        );

        res.json({
            success: true,
            total_bills: sumResult.rows[0].total_bills || 0,
            grand_total: sumResult.rows[0].grand_total || 0,
            orders: ordersResult.rows
        });
    } catch (err) {
        console.error('Cashier Activity Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Root Route - បង្ហាញទំព័រ Login មុនគេ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
