const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// តភ្ជាប់ជាមួយ Cloud Database (Neon PostgreSQL)[cite: 6]
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json({ limit: '10mb' })); // ពង្រីកទំហំ JSON សម្រាប់ຮັບ Base64 String
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// មុខងារបង្កើតតារាង Database
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

            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                barcode VARCHAR(100) UNIQUE,
                name VARCHAR(150) NOT NULL,
                price NUMERIC(10, 2) NOT NULL,
                category VARCHAR(100) DEFAULT 'General',
                image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                cashier_id INT REFERENCES users(id),
                total_amount NUMERIC(10, 2) NOT NULL,
                payment_method VARCHAR(50) DEFAULT 'Cash',
                status VARCHAR(50) DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INT REFERENCES orders(id) ON DELETE CASCADE,
                product_id INT,
                quantity INT NOT NULL,
                price NUMERIC(10, 2) NOT NULL
            );
        `);
        console.log('✅ Database tables initialized successfully!');
    } catch (err) {
        console.error('❌ Database initialization error:', err);
    }
}

initDB();

// User Routes
const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);

// ================= PRODUCT APIs (Base64 Stored in Database) =================

// ១. ទាញយកបញ្ជីផលិតផលទាំងអស់
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get Products Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// ២. បន្ថែមផលិតផលថ្មី (รับ Base64 ឬ URL ຜ່ານ JSON)
app.post('/api/products', async (req, res) => {
    const { barcode, name, price, category, image_url } = req.body;
    
    if (!name || !price) {
        return res.status(400).json({ success: false, error: 'Name and Price are required' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO products (barcode, name, price, category, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [barcode || null, name, parseFloat(price), category || 'General', image_url || null]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (dbErr) {
        console.error('Database Insert Product Error:', dbErr);
        res.status(500).json({ success: false, error: 'Database error: ' + dbErr.message });
    }
});

// ៣. កែប្រែផលិតផល
app.put('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    const { barcode, name, price, category, image_url } = req.body;

    try {
        const result = await pool.query(
            'UPDATE products SET barcode = $1, name = $2, price = $3, category = $4, image_url = $5 WHERE id = $6 RETURNING *',
            [barcode || null, name, parseFloat(price), category, image_url || null, id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (dbErr) {
        console.error('Database Update Product Error:', dbErr);
        res.status(500).json({ success: false, error: 'Database error: ' + dbErr.message });
    }
});

// ៤. លុបផលិតផល
app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM products WHERE id = $1', [id]);
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (err) {
        console.error('Delete Product Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// ================= ORDER APIs =================
app.post('/api/orders', async (req, res) => {
    const { cashier_id, total_amount, payment_method, items } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const orderQuery = `
            INSERT INTO orders (cashier_id, total_amount, payment_method, status, created_at) 
            VALUES ($1, $2, $3, 'Pending', CURRENT_TIMESTAMP) 
            RETURNING id, total_amount, created_at
        `;
        const orderResult = await client.query(orderQuery, [cashier_id, total_amount, payment_method || 'Cash']);
        const newOrderId = orderResult.rows[0].id;

        if (items && items.length > 0) {
            for (let item of items) {
                const itemQuery = `
                    INSERT INTO order_items (order_id, product_id, quantity, price)
                    VALUES ($1, $2, $3, $4)
                `;
                await client.query(itemQuery, [newOrderId, item.id, item.quantity, item.price]);
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, message: 'Order created successfully', order: orderResult.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    } finally {
        client.release();
    }
});

app.get('/api/orders/kitchen', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.id, o.total_amount, o.payment_method, o.status, o.created_at, u.full_name as cashier_name
            FROM orders o
            LEFT JOIN users u ON o.cashier_id = u.id
            WHERE o.status IN ('Pending', 'Preparing') OR o.status IS NULL
            ORDER BY o.id ASC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.patch('/api/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
        res.json({ success: true, message: 'Updated order status successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Database error' });
    }
});
// ៥. ទាញយកប្រវត្តិការលក់ទាំងអស់សម្រាប់ធ្វើ Report (Sales History)
app.get('/api/orders/history', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.id, o.total_amount, o.payment_method, o.status, o.created_at, u.full_name as cashier_name 
            FROM orders o
            LEFT JOIN users u ON o.cashier_id = u.id
            ORDER BY o.id DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get Orders History Error:', err);
        res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    }
});

// Root Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
