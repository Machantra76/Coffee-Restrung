const pool = require('../config/db');

// 1. ទាញយកតុទាំងអស់
exports.getTables = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM restaurant_tables ORDER BY id ASC');
        res.json({ success: true, data: result.rows });
    } catch (err) { // បន្ថែមពាក្យ catch ត្រង់នេះ
        res.status(500).json({ success: false, error: err.message });
    }
};
// 2. បង្កើត Order ថ្មី (ពេលអតិថិជនកុម្ម៉ង់ម្ហូប/ភេសជ្ជៈ)
exports.createOrder = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { table_id, user_id, order_type, items } = req.body; 
        // items គឺជា Array ឧ. [{product_id: 1, quantity: 2, unit_price: 2.5, notes: "ស្ករតិច"}]

        // បង្កើត Order Number ស្វ័យប្រវត្ត (ឧ. ORD-20261103-XXXX)
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const orderNumber = `ORD-${dateStr}-${randNum}`;

        // គណនាសរុបប្រាក់
        let totalAmount = 0;
        items.forEach(item => {
            totalAmount += item.quantity * item.unit_price;
        });

        // 插入 ចូលตาราง orders
        const orderQuery = `
            INSERT INTO orders (order_number, table_id, user_id, order_type, total_amount, net_amount, status) 
            VALUES ($1, $2, $3, $4, $5, $5, 'pending') RETURNING *
        `;
        const orderResult = await client.query(orderQuery, [orderNumber, table_id, user_id, order_type, totalAmount]);
        const newOrder = orderResult.rows[0];

        // 插入 ចូលតาราง order_items នីមួយៗ
        for (let item of items) {
            const subtotal = item.quantity * item.unit_price;
            await client.query(
                `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal, notes) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [newOrder.id, item.product_id, item.quantity, item.unit_price, subtotal, item.notes || '']
            );
        }

        // ប្តូរស្ថានភាពតុទៅជា 'occupied' (មានភ្ញៀវអង្គុយ) ប្រសិនបើមាន table_id
        if (table_id) {
            await client.query(`UPDATE restaurant_tables SET status = 'occupied' WHERE id = $1`, [table_id]);
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, message: 'Order created successfully', order: newOrder });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};