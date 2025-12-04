const express = require('express');
const router = express.Router();
const { calculateSellingPricesForLayers, calculateUnitConversion, findLayerIndexByUnit } = require('../utils/calculations');

/**
 * Stock Issuance & Collection Routes
 */

module.exports = (db, admin, serializeDoc) => {
    // CREATE stock issuance (WITH PRICING FIX)
    router.post('/', async (req, res) => {
        try {
            const { vehicleId, items } = req.body;

            if (!vehicleId || !items || items.length === 0) {
                return res.status(400).json({ error: 'vehicleId and items required' });
            }

            const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
            if (!vehicleDoc.exists) {
                return res.status(404).json({ error: 'Vehicle not found' });
            }

            const issuanceRef = db.collection('stock-issuances').doc();
            const issuanceData = {
                vehicleId,
                items: [],
                status: 'issued',
                issuedAt: admin.firestore.FieldValue.serverTimestamp(),
                collectedAt: null,
                notes: req.body.notes || '',
            };

            // Process each item with packaging structure support
            for (const itemToIssue of items) {
                const { inventoryId, layers } = itemToIssue; // layers = [{layerIndex, quantity}]

                const inventoryDoc = await db.collection('inventory').doc(inventoryId).get();
                if (!inventoryDoc.exists) {
                    return res.status(404).json({ error: `Inventory item ${inventoryId} not found` });
                }

                const inventoryData = inventoryDoc.data();
                const packagingStructure = inventoryData.packagingStructure || [];

                // Validate stock availability for each layer
                for (const layer of layers) {
                    const { layerIndex, quantity } = layer;
                    const packagingLayer = packagingStructure[layerIndex];

                    if (!packagingLayer) {
                        return res.status(400).json({
                            error: `Invalid layer index ${layerIndex} for ${inventoryData.productName}`
                        });
                    }

                    const currentStock = packagingLayer.stock || 0;
                    if (currentStock < quantity) {
                        return res.status(400).json({
                            error: `Insufficient stock for ${inventoryData.productName} - ${packagingLayer.unit}`,
                            available: currentStock,
                            requested: quantity
                        });
                    }
                }

                // Update inventory - subtract from each layer
                const updatedPackaging = [...packagingStructure];
                for (const layer of layers) {
                    const { layerIndex, quantity } = layer;
                    updatedPackaging[layerIndex] = {
                        ...updatedPackaging[layerIndex],
                        stock: (updatedPackaging[layerIndex].stock || 0) - quantity
                    };
                }

                await db.collection('inventory').doc(inventoryId).update({
                    packagingStructure: updatedPackaging,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });

                // Add to issuance record with layer details AND SELLING PRICES
                issuanceData.items.push({
                    inventoryId,
                    productName: inventoryData.productName,
                    layers: layers.map(l => {
                        const packagingLayer = packagingStructure[l.layerIndex];
                        return {
                            layerIndex: l.layerIndex,
                            unit: packagingLayer.unit,
                            quantity: l.quantity,
                            sellingPrice: packagingLayer.sellingPrice || 0, // ← FIX: Add selling price from packaging structure
                            collectedQty: 0,
                            collected: false,
                            collectedAt: null
                        };
                    }),
                    buyingPrice: inventoryData.buyingPricePerUnit || 0,
                });
            }

            await issuanceRef.set(issuanceData);

            const createdDoc = await issuanceRef.get();
            res.status(201).json(serializeDoc(createdDoc));
        } catch (err) {
            console.error('Stock issuance error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // GET issuances for vehicle
    router.get('/vehicles/:vehicleId/issuances', async (req, res) => {
        try {
            const snapshot = await db.collection('stock-issuances')
                .where('vehicleId', '==', req.params.vehicleId)
                .orderBy('issuedAt', 'desc')
                .get();

            const issuances = snapshot.docs.map(doc => serializeDoc(doc));
            res.json(issuances);
        } catch (err) {
            console.error('Error fetching issuances:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PATCH mark issuance item layer as collected
    router.patch('/:issuanceId/item/:itemIndex/layer/:layerIndex/collect', async (req, res) => {
        try {
            const { issuanceId, itemIndex, layerIndex } = req.params;
            const issuanceDoc = await db.collection('stock-issuances').doc(issuanceId).get();

            if (!issuanceDoc.exists) {
                return res.status(404).json({ error: 'Issuance not found' });
            }

            const issuanceData = issuanceDoc.data();
            const item = issuanceData.items[parseInt(itemIndex)];

            if (!item) {
                return res.status(404).json({ error: 'Item not found in issuance' });
            }

            const layer = item.layers[parseInt(layerIndex)];
            if (!layer) {
                return res.status(404).json({ error: 'Layer not found' });
            }

            // Mark layer as collected
            layer.collected = true;
            layer.collectedQty = layer.quantity;
            layer.collectedAt = new Date().toISOString();

            // Check if all items' all layers are collected
            const allCollected = issuanceData.items.every(i =>
                i.layers.every(l => l.collected)
            );

            await db.collection('stock-issuances').doc(issuanceId).update({
                items: issuanceData.items,
                status: allCollected ? 'collected' : 'partial',
                collectedAt: allCollected ? admin.firestore.FieldValue.serverTimestamp() : null,
            });

            res.json({ success: true, status: allCollected ? 'collected' : 'partial' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });





    return router;
};
