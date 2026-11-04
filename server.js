const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// តភ្ជាប់ជាមួយ Cloud Database (Neon PostgreSQL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// មុខងារបង្កើតតារាង Database (រួមទាំង users, products, orders, order_items, និង stock_in_history)
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
                stock_qty INT DEFAULT 0,
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

            CREATE TABLE IF NOT EXISTS stock_in_history (
                id SERIAL PRIMARY KEY,
                product_id INT REFERENCES products(id) ON DELETE CASCADE,
                quantity_added INT NOT NULL,
                cost_price NUMERIC(10, 2) DEFAULT 0,
                note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

// ================= PRODUCT APIs =================

app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get Products Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/products', async (req, res) => {
    const { barcode, name, price, category, stock_qty, image_url } = req.body;
    
    if (!name || !price) {
        return res.status(400).json({ success: false, error: 'Name and Price are required' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO products (barcode, name, price, category, stock_qty, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [barcode || null, name, parseFloat(price), category || 'General', parseInt(stock_qty) || 0, image_url || null]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (dbErr) {
        console.error('Database Insert Product Error:', dbErr);
        res.status(500).json({ success: false, error: 'Database error: ' + dbErr.message });
    }
});

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

// ================= INVENTORY / STOCK APIs =================

app.put('/api/inventory/:id/stock', async (req, res) => {
    const { id } = req.params;
    const { stock_qty } = req.body;
    try {
        const result = await pool.query(
            'UPDATE products SET stock_qty = $1 WHERE id = $2 RETURNING *',
            [parseInt(stock_qty) || 0, id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Update Stock Error:', err);
        res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    }
});

// 📦 API សម្រាប់បន្ថែមស្តុកចូលថ្មី (Stock In) ព្រមទាំងកត់ត្រាកាលបរិច្ឆេទ និងតម្លៃដើម
app.post('/api/inventory/stock-in', async (req, res) => {
    const { product_id, quantity_added, cost_price, note } = req.body;

    if (!product_id || !quantity_added || quantity_added <= 0) {
        return res.status(400).json({ success: false, error: 'Product ID and valid quantity are required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const historyQuery = `
            INSERT INTO stock_in_history (product_id, quantity_added, cost_price, note, created_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            RETURNING *;
        `;
        const historyResult = await client.query(historyQuery, [
            product_id, 
            parseInt(quantity_added), 
            parseFloat(cost_price) || 0, 
            note || 'ស្តុកចូលថ្មី (Stock In)'
        ]);

        const updateProductQuery = `
            UPDATE products 
            SET stock_qty = stock_qty + $1 
            WHERE id = $2 
            RETURNING *;
        `;
        const productResult = await client.query(updateProductQuery, [parseInt(quantity_added), product_id]);

        if (productResult.rows.length === 0) {
            throw new Error('រកមិនឃើញផលិតផលនេះក្នុងប្រព័ន្ធទេ។');
        }

        await client.query('COMMIT');
        res.status(201).json({ 
            success: true, 
            message: 'បានបន្ថែមស្តុកចូលថ្មីដោយជោគជ័យ!', 
            data: {
                product: productResult.rows[0],
                stock_in_record: historyResult.rows[0]
            }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Stock In Error:', err);
        res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    } finally {
        client.release();
    }
});

app.get('/api/inventory', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, price, category, stock_qty, image_url FROM products ORDER BY id DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get Inventory Error:', err);
        res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    }
});

// ================= ORDER APIs (With Strict Stock Validation & Deduction) =================
app.post('/api/orders', async (req, res) => {
    const { cashier_id, total_amount, payment_method, items } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ១. ពិនិត្យស្តុក និងទប់ស្កាត់មិនឱ្យលក់លើសចំនួនក្នុងឃ្លាំង
        if (items && items.length > 0) {
            for (let item of items) {
                const checkStock = await client.query('SELECT stock_qty, name FROM products WHERE id = $1', [item.id]);
                if (checkStock.rows.length === 0) {
                    throw new Error(`ទំនិញ ID ${item.id} មិនមានក្នុងប្រព័ន្ធទេ។`);
                }

                const currentStock = checkStock.rows[0].stock_qty || 0;
                
                if (currentStock < item.quantity) {
                    throw new Error(`ទំនិញ "${checkStock.rows[0].name}" ក្នុងស្តុកសល់តែ ${currentStock} ប៉ុណ្ណោះ មិនអាចលក់ចំនួន ${item.quantity} បានទេ!`);
                }

                await client.query(
                    'UPDATE products SET stock_qty = stock_qty - $1 WHERE id = $2',
                    [item.quantity, item.id]
                );
            }
        }

        // ២. បង្កើត Order ថ្មី
        const orderQuery = `
            INSERT INTO orders (cashier_id, total_amount, payment_method, status, created_at) 
            VALUES ($1, $2, $3, 'Pending', CURRENT_TIMESTAMP) 
            RETURNING id, total_amount, created_at
        `;
        const orderResult = await client.query(orderQuery, [cashier_id, total_amount, payment_method || 'Cash']);
        const newOrderId = orderResult.rows[0].id;

        // ៣. បញ្ចូលទិន្នន័យចូល order_items
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
        res.status(201).json({ success: true, message: 'Order created successfully and stock updated', order: orderResult.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
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

// 📊 ៥. ទាញយកប្រវត្តិការលក់ (Sales History) + Filter កាលបរិច្ឆេទ + គណនាប្រាក់ចំណេញសរុប និងប្រចាំថ្ងៃ (Daily Summary)
app.get('/api/orders/history', async (req, res) => {
    const { fromDate, toDate } = req.query;
    try {
        let whereClauses = [];
        let params = [];

        if (fromDate) {
            params.push(`${fromDate} 00:00:00`);
            whereClauses.push(`o.created_at >= $${params.length}`);
        }
        if (toDate) {
            params.push(`${toDate} 23:59:59`);
            whereClauses.push(`o.created_at <= $${params.length}`);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // ១. ទាញយកបញ្ជីវិក្កយបត្រទាំងអស់
        const query = `
            SELECT o.id, o.total_amount, o.payment_method, o.status, o.created_at, u.full_name as cashier_name 
            FROM orders o
            LEFT JOIN users u ON o.cashier_id = u.id
            ${whereSql}
            ORDER BY o.id DESC
        `;
        const result = await pool.query(query, params);

        // ២. គណនាប្រាក់ចំណេញសរុប (Total Profit)
        const profitQuery = `
            SELECT COALESCE(SUM((oi.price - COALESCE(s.cost_price, 0)) * oi.quantity), 0) as total_profit
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            LEFT JOIN (
                SELECT DISTINCT ON (product_id) product_id, cost_price 
                FROM stock_in_history 
                ORDER BY product_id, created_at DESC
            ) s ON oi.product_id = s.product_id
            ${whereSql}
        `;
        const profitResult = await pool.query(profitQuery, params);
        const totalProfit = parseFloat(profitResult.rows[0]?.total_profit || 0);

        // ៣. 📊 グループ (Group) ទិន្នន័យសង្ខេបតាមថ្ងៃនីមួយៗ (Daily Breakdown)
        const dailyQuery = `
            SELECT 
                DATE(o.created_at) as sale_date,
                COUNT(o.id) as total_orders,
                SUM(o.total_amount) as daily_revenue,
                COALESCE(SUM((oi.price - COALESCE(s.cost_price, 0)) * oi.quantity), 0) as daily_profit
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN (
                SELECT DISTINCT ON (product_id) product_id, cost_price 
                FROM stock_in_history 
                ORDER BY product_id, created_at DESC
            ) s ON oi.product_id = s.product_id
            ${whereSql}
            GROUP BY DATE(o.created_at)
            ORDER BY sale_date DESC;
        `;
        const dailyResult = await pool.query(dailyQuery, params);

        res.json({ 
            success: true, 
            data: result.rows,
            total_profit: totalProfit,
            daily_summary: dailyResult.rows
        });
    } catch (err) {
        console.error('Get Orders History Error:', err);
        res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    }
});

app.get('/api/users/cashiers-list', async (req, res) => {
    try {
        const result = await pool.query("SELECT id, username, full_name FROM users WHERE role = 'Cashier' AND is_active = true ORDER BY id DESC");
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get Cashiers List Error:', err);
        res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    }
});

app.get('/api/orders/cashier-activity/:cashierId', async (req, res) => {
    const { cashierId } = req.params;
    try {
        let query = `
            SELECT o.id, o.order_number, o.total_amount, o.payment_method, o.status, o.created_at, u.full_name as cashier_name 
            FROM orders o
            LEFT JOIN users u ON o.cashier_id = u.id OR o.user_id = u.id
        `;
        let queryParams = [];

        if (cashierId && cashierId !== 'all') {
            query += ` WHERE o.cashier_id = $1 OR o.user_id = $1`;
            queryParams.push(cashierId);
        }

        query += ` ORDER BY o.id DESC`;

        const result = await pool.query(query, queryParams);
        const orders = result.rows;
        
        let grandTotal = 0;
        orders.forEach(o => grandTotal += Number(o.total_amount || 0));

        res.json({
            success: true,
            total_bills: orders.length,
            grand_total: grandTotal,
            orders: orders,
            data: orders
        });
    } catch (err) {
        console.error('Get Cashier Activity Error:', err);
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
