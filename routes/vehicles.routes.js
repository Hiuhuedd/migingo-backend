const express = require('express');
const router = express.Router();

/**
 * Vehicle Management Routes
 */

module.exports = (db, admin, serializeDoc) => {
    // GET all vehicles
    router.get('/', async (req, res) => {
        try {
            const snapshot = await db.collection('vehicles').where('isActive', '==', true).get();
            const vehicles = snapshot.docs.map(doc => serializeDoc(doc));
            res.json(vehicles);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // CREATE vehicle
    router.post('/', async (req, res) => {
        try {
            const { vehicleName, registrationNumber, salesTeamMember } = req.body;
            const data = {
                vehicleName,
                registrationNumber,
                salesTeamMember,
                isActive: true,
                dateCreated: admin.firestore.FieldValue.serverTimestamp(),
            };
            const ref = await db.collection('vehicles').add(data);
            res.status(201).json({ id: ref.id, ...data });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET vehicle by ID
    router.get('/:id', async (req, res) => {
        try {
            const doc = await db.collection('vehicles').doc(req.params.id).get();
            if (!doc.exists) return res.status(404).json({ error: 'Vehicle not found' });
            res.json(serializeDoc(doc));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET vehicle issuances
    router.get('/:id/issuances', async (req, res) => {
        try {
            const snapshot = await db.collection('stock-issuances')
                .where('vehicleId', '==', req.params.id)
                .orderBy('issuedAt', 'desc')
                .get();

            const issuances = snapshot.docs.map(doc => serializeDoc(doc));
            res.json(issuances);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get collected items for a vehicle (for sales) - WITH PRICES
    router.get('/:id/collected-items', async (req, res) => {
        try {
            const snapshot = await db.collection('stock-issuances')
                .where('vehicleId', '==', req.params.id)
                .get();

            const collectedItems = [];
            const itemsMap = new Map();
            const inventoryCache = new Map();

            // First pass: collect all items and fetch inventory data
            for (const doc of snapshot.docs) {
                const issuance = doc.data();
                for (const item of issuance.items) {
                    // Fetch inventory data if not cached
                    if (!inventoryCache.has(item.inventoryId)) {
                        const inventoryDoc = await db.collection('inventory').doc(item.inventoryId).get();
                        if (inventoryDoc.exists) {
                            inventoryCache.set(item.inventoryId, inventoryDoc.data());
                        }
                    }

                    const inventoryData = inventoryCache.get(item.inventoryId);
                    const packagingStructure = inventoryData?.packagingStructure || [];

                    item.layers.forEach(layer => {
                        if (layer.collected) {
                            const key = `${item.inventoryId}-${layer.unit}`;
                            const existing = itemsMap.get(key);

                            if (existing) {
                                existing.quantity += layer.quantity;
                            } else {
                                itemsMap.set(key, {
                                    inventoryId: item.inventoryId,
                                    productName: item.productName,
                                    unit: layer.unit,
                                    quantity: layer.quantity,
                                    sellingPrice: layer.sellingPrice || 0,
                                    layerIndex: layer.layerIndex,
                                    packagingStructure: packagingStructure,
                                });
                            }
                        }
                    });
                }
            }

            collectedItems.push(...itemsMap.values());
            res.json(collectedItems);
        } catch (err) {
            console.error('Error fetching collected items:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
