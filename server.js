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
        
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Pending';
        `);

        console.log('✅ Database tables (users, orders, order_items) initialized successfully on Cloud!');
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

// API សម្រាប់ទាញយកបញ្ជីផលិតផល
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get Products Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// API សម្រាប់បង្កើត Order និងរក្សាទុកមុខទំនិញនីមួយៗចូល order_items
app.post('/api/orders', async (req, res) => {
    const { cashier_id, total_amount, payment_method, items } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // ចាប់ផ្តើម Transaction

        // ១. បញ្ចូលទិន្នន័យចូលតារាង orders
        const orderQuery = `
            INSERT INTO orders (cashier_id, total_amount, payment_method, status, created_at) 
            VALUES ($1, $2, $3, 'Pending', CURRENT_TIMESTAMP) 
            RETURNING id, total_amount, created_at
        `;
        const orderResult = await client.query(orderQuery, [cashier_id, total_amount, payment_method || 'Cash']);
        const newOrderId = orderResult.rows[0].id;

        // ២. បញ្ចូលមុខទំនិញនីមួយៗចូលតារាង order_items
        if (items && items.length > 0) {
            for (let item of items) {
                const itemQuery = `
                    INSERT INTO order_items (order_id, product_id, quantity, price)
                    VALUES ($1, $2, $3, $4)
                `;
                await client.query(itemQuery, [newOrderId, item.id, item.quantity, item.price]);
            }
        }

        await client.query('COMMIT'); // រក្សាទុកជាផ្លូវការ
        
        res.status(201).json({ 
            success: true, 
            message: 'Order and items created successfully', 
            order: orderResult.rows[0] 
        });

    } catch (err) {
        await client.query('ROLLBACK'); // បើខុស គឺបោះបង់ចោលវិញ
        console.error('Create Order Error:', err);
        res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    } finally {
        client.release();
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

// API សម្រាប់ទាញយក Order ដែលមិនទាន់ប្រគល់ជូន (Pending & Preparing) សម្រាប់ផ្ទះបាយ
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
        console.error('Kitchen Orders Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// API សម្រាប់ប្តូរស្ថានភាព Order (Pending -> Preparing -> Completed)
app.patch('/api/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'Preparing' ឬ 'Completed'
    try {
        await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
        res.json({ success: true, message: 'Updated order status successfully' });
    } catch (err) {
        console.error('Update Order Status Error:', err);
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
