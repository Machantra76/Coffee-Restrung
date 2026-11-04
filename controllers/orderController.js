const pool = require('../config/db');

// 1. ទាញយកតុទាំងអស់
exports.getTables = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM restaurant_tables ORDER BY id ASC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// 2. បង្កើត Order ថ្មី (គាំទ្រទាំង POS Terminal និងប្រព័ន្ធបញ្ជាទិញតាមតុ)
exports.createOrder = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { table_id, user_id, cashier_id, order_type, payment_method, total_amount, items } = req.body; 
        
        // ប្រើប្រាស់ user_id ឬ cashier_id ណាមួយដែលមាន
        const actualUserId = user_id || cashier_id || null;
        const actualPaymentMethod = payment_method || 'Cash';
        const actualOrderType = order_type || 'POS';

        // បង្កើត Order Number ស្វ័យប្រវត្ត (ឧ. ORD-20261103-XXXX)
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const orderNumber = `ORD-${dateStr}-${randNum}`;

        // គណនាសរុបប្រាក់ ប្រសិនបើមិនបានបញ្ជូនមកស្រាប់
        let calculatedTotal = 0;
        if (items && items.length > 0) {
            items.forEach(item => {
                const p = item.unit_price || item.price || 0;
                calculatedTotal += item.quantity * p;
            });
        }
        const finalTotal = total_amount !== undefined ? total_amount : calculatedTotal;

        // 插入 ចូលតារាង orders (គាំទ្រទាំង cashier_id និង user_id)
        const orderQuery = `
            INSERT INTO orders (order_number, table_id, user_id, cashier_id, order_type, total_amount, net_amount, payment_method, status) 
            VALUES ($1, $2, $3, $3, $4, $5, $5, $6, 'pending') RETURNING *
        `;
        const orderResult = await client.query(orderQuery, [
            orderNumber, 
            table_id || null, 
            actualUserId, 
            actualOrderType, 
            finalTotal, 
            actualPaymentMethod
        ]);
        const newOrder = orderResult.rows[0];

        // 插入 ចូលតារាង order_items នីមួយៗ (គាំទ្រទាំង product_id/id និង unit_price/price ព្រមទាំង subtotal)
        if (items && items.length > 0) {
            for (let item of items) {
                const prodId = item.product_id || item.id;
                const unitPrice = item.unit_price || item.price || 0;
                const subtotal = item.quantity * unitPrice;

                await client.query(
                    `INSERT INTO order_items (order_id, product_id, quantity, price, unit_price, subtotal, notes) 
                     VALUES ($1, $2, $3, $4, $4, $5, $6)`,
                    [newOrder.id, prodId, item.quantity, unitPrice, subtotal, item.notes || '']
                );
            }
        }

        // ប្តូរស្ថានភាពតុទៅជា 'occupied' (មានភ្ញៀវអង្គុយ) ប្រសិនបើមាន table_id
        if (table_id) {
            await client.query(`UPDATE restaurant_tables SET status = 'occupied' WHERE id = $1`, [table_id]);
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, message: 'Order created successfully', order: newOrder });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Create Order Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};
