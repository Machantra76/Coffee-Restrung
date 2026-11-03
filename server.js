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
