const express = require('express');
const router = express.Router();

/**
 * Sales Management Routes
 */

module.exports = (db, admin, serializeDoc) => {
    // Record a new sale
    router.post('/', async (req, res) => {
        try {
            const { vehicleId, items, paymentMethod, totalAmount, customerName, notes } = req.body;

            if (!vehicleId || !items || items.length === 0 || !totalAmount) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // 1. Validate and Deplete Inventory (FIFO)
            const batch = db.batch();
            const saleRef = db.collection('sales').doc();

            // Get all collected issuances for this vehicle, ordered by date (FIFO)
            const issuancesSnapshot = await db.collection('stock-issuances')
                .where('vehicleId', '==', vehicleId)
                .orderBy('issuedAt', 'asc') // Oldest first
                .get();

            if (issuancesSnapshot.empty) {
                return res.status(400).json({ error: 'No inventory found for this vehicle' });
            }

            // Map to store updates for each issuance document
            // docId -> { itemIndex -> { layerIndex -> newSoldQty } }
            const issuanceUpdates = new Map();

            for (const soldItem of items) {
                let remainingToSell = soldItem.quantity;
                const { inventoryId, unit } = soldItem;

                // Iterate through issuances to find matching items
                for (const doc of issuancesSnapshot.docs) {
                    if (remainingToSell <= 0) break;

                    const issuance = doc.data();
                    let docUpdated = false;

                    issuance.items.forEach((item, itemIndex) => {
                        if (item.inventoryId === inventoryId) {
                            item.layers.forEach((layer, layerIndex) => {
                                if (layer.unit === unit && layer.collected) {
                                    const soldQty = layer.soldQty || 0;
                                    const available = layer.quantity - soldQty;

                                    if (available > 0) {
                                        const take = Math.min(remainingToSell, available);

                                        // Track update
                                        if (!issuanceUpdates.has(doc.id)) {
                                            issuanceUpdates.set(doc.id, JSON.parse(JSON.stringify(issuance))); // Deep copy
                                        }
                                        const docData = issuanceUpdates.get(doc.id);

                                        // Update the specific layer in our copy
                                        docData.items[itemIndex].layers[layerIndex].soldQty = (docData.items[itemIndex].layers[layerIndex].soldQty || 0) + take;

                                        remainingToSell -= take;
                                    }
                                }
                            });
                        }
                    });
                }

                if (remainingToSell > 0) {
                    return res.status(400).json({
                        error: `Insufficient stock for ${soldItem.productName} (${unit}). Missing ${remainingToSell}`
                    });
                }
            }

            // 2. Commit Updates to Issuances
            for (const [docId, updatedData] of issuanceUpdates) {
                const docRef = db.collection('stock-issuances').doc(docId);
                batch.update(docRef, {
                    items: updatedData.items,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // 3. Create Sale Record
            const saleData = {
                vehicleId,
                items, // [{ inventoryId, productName, unit, quantity, price, total }]
                paymentMethod, // 'cash', 'mpesa', 'debt'
                totalAmount,
                customerName: customerName || 'Walk-in',
                notes: notes || '',
                soldAt: admin.firestore.FieldValue.serverTimestamp(),
                date: new Date().toISOString().split('T')[0] // For easier querying by date
            };

            batch.set(saleRef, saleData);

            await batch.commit();

            const savedSale = await saleRef.get();
            res.status(201).json(serializeDoc(savedSale));

        } catch (err) {
            console.error('Error recording sale:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Get Sales List
    router.get('/', async (req, res) => {
        try {
            const { vehicleId, date, startDate, endDate, limit } = req.query;

            let query = db.collection('sales');

            if (vehicleId) {
                query = query.where('vehicleId', '==', vehicleId);
            }

            if (date) {
                query = query.where('date', '==', date);
            } else if (startDate && endDate) {
                query = query.where('date', '>=', startDate).where('date', '<=', endDate);
            }

            query = query.orderBy('soldAt', 'desc');

            if (limit) {
                query = query.limit(parseInt(limit));
            }

            const snapshot = await query.get();
            const sales = snapshot.docs.map(doc => serializeDoc(doc));

            res.json(sales);
        } catch (err) {
            console.error('Error fetching sales:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Get Sales Stats
    router.get('/stats', async (req, res) => {
        try {
            const { vehicleId, date } = req.query;

            let query = db.collection('sales');

            if (vehicleId) {
                query = query.where('vehicleId', '==', vehicleId);
            }

            if (date) {
                query = query.where('date', '==', date);
            }

            const snapshot = await query.get();

            let totalRevenue = 0;
            const paymentMethods = {
                cash: 0,
                mpesa: 0,
                debt: 0
            };
            let totalItemsSold = 0;

            snapshot.docs.forEach(doc => {
                const sale = doc.data();
                const amount = parseFloat(sale.totalAmount) || 0;

                totalRevenue += amount;

                if (sale.paymentMethod && paymentMethods[sale.paymentMethod] !== undefined) {
                    paymentMethods[sale.paymentMethod] += amount;
                }

                if (sale.items && Array.isArray(sale.items)) {
                    sale.items.forEach(item => {
                        totalItemsSold += (item.quantity || 0);
                    });
                }
            });

            res.json({
                totalRevenue,
                paymentMethods,
                totalItemsSold,
                saleCount: snapshot.size
            });

        } catch (err) {
            console.error('Error fetching stats:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
