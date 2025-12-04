const express = require('express');
const router = express.Router();

/**
 * Supplier Routes
 */

module.exports = () => {
    // GET suppliers list
    router.get('/', (req, res) => {
        try {
            const data = require('../data/supplierItems.json');
            res.json(data.items);
        } catch (err) {
            res.status(500).json({ error: 'Suppliers not found' });
        }
    });

    return router;
};
