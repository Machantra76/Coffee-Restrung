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

// មុខងារបង្កើត និងត្រួតពិនិត្យតារាង Database
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
                cost_price NUMERIC(10, 2) DEFAULT 0,
                category VARCHAR(100) DEFAULT 'General',
                unit VARCHAR(50) DEFAULT 'ដប',
                stock_qty INT DEFAULT 0,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                cashier_id INT REFERENCES users(id),
                table_no VARCHAR(50),
                total_amount NUMERIC(10, 2) NOT NULL,
                payment_method VARCHAR(50),
                status VARCHAR(50) DEFAULT 'Customer_Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INT REFERENCES orders(id) ON DELETE CASCADE,
                product_id INT REFERENCES products(id),
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

        // 🛠️ បន្ថែមស្វ័យប្រវត្តិ (ALTER TABLE) ករណីតារាងមានស្រាប់តែខ្វះ Column ថ្មី
        await pool.query(`
            ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2) DEFAULT 0;
            ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'ដប';
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_no VARCHAR(50);
            ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'Customer_Pending';
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
    const { barcode, name, price, cost_price, category, unit, image_url } = req.body;
    
    if (!name || price === undefined) {
        return res.status(400).json({ success: false, error: 'Name and Price are required' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO products (barcode, name, price, cost_price, category, unit, stock_qty, image_url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                barcode || null, 
                name, 
                parseFloat(price) || 0, 
                parseFloat(cost_price) || 0, 
                category || 'General', 
                unit || 'ដប', 
                0, 
                image_url || null
            ]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (dbErr) {
        console.error('Database Insert Product Error:', dbErr);
        res.status(500).json({ success: false, error: 'Database error: ' + dbErr.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    const { barcode, name, price, cost_price, category, unit, image_url } = req.body;

    try {
        const result = await pool.query(
            `UPDATE products 
             SET barcode = $1, name = $2, price = $3, cost_price = $4, category = $5, unit = $6, image_url = $7 
             WHERE id = $8 RETURNING *`,
            [
                barcode || null, 
                name, 
                parseFloat(price) || 0, 
                parseFloat(cost_price) || 0, 
                category || 'General', 
                unit || 'ដប', 
                image_url || null, 
                id
            ]
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

// 🗑️ API សម្រាប់លុបវិក្កយបត្រ និងបូកស្តុកសងវិញ
app.delete('/api/orders/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const itemsResult = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [id]);
        
        for (let item of itemsResult.rows) {
            if (item.product_id) {
                await client.query(
                    'UPDATE products SET stock_qty = stock_qty + $1 WHERE id = $2',
                    [item.quantity, item.product_id]
                );
            }
        }

        await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);
        const deleteOrderRes = await client.query('DELETE FROM orders WHERE id = $1 RETURNING *', [id]);

        if (deleteOrderRes.rowCount === 0) {
            throw new Error('រកមិនឃើញវិក្កយបត្រនេះទេ។');
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'លុបវិក្កយបត្រ និងបូកស្តុកសងវិញបានជោគជ័យ!' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Delete Order Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
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
        const result = await pool.query('SELECT id, name, price, cost_price, category, unit, stock_qty, image_url FROM products ORDER BY id DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get Inventory Error:', err);
        res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    }
});

// 🪑 API សម្រាប់ទាញយកតុ Active Tables (ផ្អែកលើการមិនទាន់បង់ប្រាក់ Checkout)
app.get('/api/orders/active-tables', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT id, table_no, total_amount, status, created_at
            FROM orders
            WHERE payment_method IS NULL OR payment_method = ''
            ORDER BY id ASC
        `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get Active Tables Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// 📦 API សម្រាប់ទាញយកមុខទំនិញលម្អិតតាម Order ID
app.get('/api/orders/:id/items', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT p.id as product_id, p.name, oi.quantity, oi.price
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = $1
        `;
        const result = await pool.query(query, [id]);
        res.json({ success: true, items: result.rows });
    } catch (err) {
        console.error('Get Order Items Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// ================= ORDER & QR ORDERING APIs =================

// 1. API សម្រាប់បង្កើត Order ថ្មីជានិច្ច
app.post('/api/orders', async (req, res) => {
    const { cashier_id, table_no, total_amount, payment_method, items } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const addedAmount = parseFloat(total_amount) || 0;
        const initialStatus = table_no ? 'Customer_Pending' : 'Pending';

        const orderQuery = `
            INSERT INTO orders (cashier_id, table_no, total_amount, payment_method, status, created_at) 
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) 
            RETURNING id, total_amount, created_at, status
        `;
        const orderResult = await client.query(orderQuery, [
            cashier_id || null, 
            table_no || 'Walk-in', 
            addedAmount, 
            null, 
            initialStatus
        ]);
        const targetOrderId = orderResult.rows[0].id;

        if (items && items.length > 0) {
            for (let item of items) {
                const checkStock = await client.query('SELECT stock_qty, name FROM products WHERE id = $1', [item.id]);
                if (checkStock.rows.length === 0) {
                    throw new Error(`ទំនិញ ID ${item.id} មិនមានក្នុងប្រព័ន្ធទេ។`);
                }
                const currentStock = checkStock.rows[0].stock_qty || 0;
                if (currentStock < item.quantity) {
                    throw new Error(`ទំនិញ "${checkStock.rows[0].name}" ក្នុងស្តុកសល់តែ ${currentStock} ប៉ុណ្ណោះ!`);
                }
                
                await client.query(
                    'UPDATE products SET stock_qty = stock_qty - $1 WHERE id = $2',
                    [item.quantity, item.id]
                );

                await client.query(
                    `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)`,
                    [targetOrderId, item.id, item.quantity, item.price]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ 
            success: true, 
            message: 'Order created successfully', 
            order: { id: targetOrderId } 
        });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// 2. API សម្រាប់ទាញយកគ្រប់ Order ទាំងអស់ដែលមិនទាន់បង់ប្រាក់តាមតុ (សម្រាប់ Cashier គិតលុយរួម)
app.get('/api/orders/unpaid-by-table', async (req, res) => {
    const { table_no } = req.query;
    if (!table_no) {
        return res.status(400).json({ success: false, error: 'Table number is required' });
    }

    try {
        const ordersQuery = `
            SELECT id FROM orders 
            WHERE table_no = $1 AND (payment_method IS NULL OR payment_method = '')
            ORDER BY id ASC
        `;
        const ordersRes = await pool.query(ordersQuery, [table_no]);
        const orderIds = ordersRes.rows.map(row => row.id);

        if (orderIds.length === 0) {
            return res.json({ success: true, order_ids: [], items: [] });
        }

        const itemsQuery = `
            SELECT p.id as product_id, p.name, oi.quantity, oi.price
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ANY($1::int[])
        `;
        const itemsRes = await pool.query(itemsQuery, [orderIds]);

        res.json({ success: true, order_ids: orderIds, items: itemsRes.rows });
    } catch (err) {
        console.error('Get Unpaid Orders By Table Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// 3. API សម្រាប់បង់ប្រាក់ Checkout គ្រប់ Orders ទាំងអស់របស់តុក្នុងពេលតែមួយ[cite: 3]
app.post('/api/orders/pay-by-table', async (req, res) => {
    const { table_no, payment_method, total_amount, cashier_id } = req.body;
    if (!table_no) {
        return res.status(400).json({ success: false, error: 'Table number is required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const updateQuery = `
            UPDATE orders 
            SET payment_method = $1, status = 'Completed', cashier_id = COALESCE($2, cashier_id)
            WHERE table_no = $3 AND (payment_method IS NULL OR payment_method = '')
            RETURNING id
        `;
        const updateRes = await client.query(updateQuery, [payment_method || 'Cash', cashier_id || null, table_no]);

        if (updateRes.rowCount === 0) {
            throw new Error('រកមិនឃើញ Order ដែលត្រូវបង់ប្រាក់សម្រាប់តុនេះទេ។');
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'បានបង់ប្រាក់ និងបញ្ចប់វិក្កយបត្រតុនេះជោគជ័យ!', order_ids: updateRes.rows.map(r => r.id) });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Pay By Table Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// 4. API សម្រាប់ Sales Dashboard
app.get('/api/orders/customer-pending', async (req, res) => {
    try {
        const orderQuery = `
            SELECT o.id, o.table_no, o.total_amount, o.payment_method, o.status, o.created_at
            FROM orders o
            WHERE o.status = 'Customer_Pending'
            ORDER BY o.id ASC
        `;
        const orderResult = await pool.query(orderQuery);
        const orders = orderResult.rows;

        for (let order of orders) {
            const itemsResult = await pool.query(`
                SELECT p.name, oi.quantity, oi.price, p.category
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = $1
            `, [order.id]);
            order.items = itemsResult.rows;
        }

        res.json({ success: true, data: orders });
    } catch (err) {
        console.error('Customer Pending Orders Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// 5. API សម្រាប់ Sales ចុច Accept
app.post('/api/orders/:id/accept', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `UPDATE orders SET status = 'Pending' WHERE id = $1 AND status = 'Customer_Pending' RETURNING *`,
            [id]
        );
        if (result.rowCount === 0) {
            return res.status(400).json({ success: false, error: 'រកមិនឃើញ Order នេះ ឬត្រូវបានទទួលរួចហើយ!' });
        }
        res.json({ success: true, message: 'បានទទួលយក Order នេះដោយជោគជ័យ!' });
    } catch (err) {
        console.error('Accept Order Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// 💰 6. API សម្រាប់បង់ប្រាក់ Checkout តាម Order ID ធម្មតា
app.post('/api/orders/:id/pay', async (req, res) => {
    const { id } = req.params;
    const { payment_method, total_amount } = req.body;
    try {
        await pool.query(
            `UPDATE orders SET payment_method = $1, total_amount = $2, status = 'Completed' WHERE id = $3`,
            [payment_method || 'Cash', parseFloat(total_amount) || 0, id]
        );
        res.json({ success: true, message: 'បានបង់ប្រាក់ និងបញ្ចប់វិក្កយបត្រជោគជ័យ!' });
    } catch (err) {
        console.error('Pay Order Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// 🍳 API សម្រាប់ផ្ទះបាយ
app.get('/api/orders/kitchen', async (req, res) => {
    try {
        const orderQuery = `
            SELECT DISTINCT o.id, o.table_no, o.total_amount, o.payment_method, o.status, o.created_at, u.full_name as cashier_name
            FROM orders o
            LEFT JOIN users u ON o.cashier_id = u.id
            WHERE o.status != 'Customer_Pending'
              AND (o.status IN ('Pending', 'Preparing') OR o.status IS NULL)
              AND EXISTS (
                  SELECT 1 FROM order_items oi
                  JOIN products p ON oi.product_id = p.id
                  WHERE oi.order_id = o.id 
                    AND (
                        LOWER(p.category) = 'food' OR
                        p.category LIKE '%គ្រឿងសមុទ្រ%' OR
                        p.category LIKE '%បាយឆា%' OR
                        p.category LIKE '%ស៊ុប%' OR
                        p.category LIKE '%សាច់គោ%' OR
                        p.category LIKE '%ឆាបន្លែ%' OR
                        p.category LIKE '%ភ្លា%' OR
                        p.category LIKE '%ម្ហូបចិន%'
                    )
              )
            ORDER BY o.id ASC
        `;
        const orderResult = await pool.query(orderQuery);
        const orders = orderResult.rows;

        for (let order of orders) {
            const itemsResult = await pool.query(`
                SELECT 
                    p.id as product_id,
                    p.name, 
                    oi.quantity,
                    p.category,
                    oi.id as item_id
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = $1 
                  AND (
                      LOWER(p.category) = 'food' OR
                      p.category LIKE '%គ្រឿងសមុទ្រ%' OR
                      p.category LIKE '%បាយឆា%' OR
                      p.category LIKE '%ស៊ុប%' OR
                      p.category LIKE '%សាច់គោ%' OR
                      p.category LIKE '%ឆាបន្លែ%' OR
                      p.category LIKE '%ភ្លា%' OR
                      p.category LIKE '%ម្ហូបចិន%'
                  )
                ORDER BY oi.id ASC
            `, [order.id]);

            order.items = itemsResult.rows.map(item => ({
                name: item.name,
                quantity: item.quantity,
                added_qty: 0
            }));
        }

        res.json({ success: true, data: orders });
    } catch (err) {
        console.error('Kitchen Orders Error:', err);
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

// Root Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
