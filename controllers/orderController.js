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

// 2. បង្កើត Order ថ្មី (បញ្ចូល order_number ស្វ័យប្រវត្តិដើម្បីការពារ Not-Null Constraint)
exports.createOrder = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { table_id, user_id, cashier_id, order_type, payment_method, total_amount, items } = req.body; 
        
        const actualUserId = user_id || cashier_id || null;
        const actualPaymentMethod = payment_method || 'Cash';
        const actualOrderType = order_type || 'POS';

        // បង្កើត Order Number ស្វ័យប្រវត្តិជានិច្ច
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const orderNumber = `ORD-${dateStr}-${randNum}`;

        // គណនា Total និង Items
        let calculatedTotal = 0;
        const processedItems = items.map(item => {
            const itemPrice = Number(item.unit_price || item.price || 0);
            const itemQty = Number(item.quantity || 1);
            const subtotal = itemQty * itemPrice;
            calculatedTotal += subtotal;
            return {
                product_id: item.product_id || item.id,
                quantity: itemQty,
                price: itemPrice,
                subtotal: subtotal,
                notes: item.notes || ''
            };
        });

        const finalTotal = total_amount !== undefined ? Number(total_amount) : calculatedTotal;

        // 插入 ចូលតារាង orders ដោយដាក់ order_number ចូលទៅជាមួយ
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

        // 插入 ចូលតារាង order_items នីមួយៗ
        for (let item of processedItems) {
            await client.query(
                `INSERT INTO order_items (order_id, product_id, quantity, price, unit_price, subtotal, notes) 
                 VALUES ($1, $2, $3, $4, $4, $5, $6)`,
                [newOrder.id, item.product_id, item.quantity, item.price, item.subtotal, item.notes]
            );
        }

        // ប្តូរស្ថានភាពតុទៅជា 'occupied' ប្រសិនបើមាន table_id
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
