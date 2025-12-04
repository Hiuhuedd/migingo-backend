const express = require('express');
const router = express.Router();
const { calculateUnitConversion, findLayerIndexByUnit } = require('../utils/calculations');


module.exports = (db, admin, serializeDoc) => {

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
        // ========== VEHICLES ==========
        router.get('/', async (req, res) => {
        try {
            const snapshot = await db.collection('vehicles').where('isActive', '==', true).get();
            const vehicles = snapshot.docs.map(doc => serializeDoc(doc));
            res.json(vehicles);
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



    // Break down units in vehicle inventory (for sales)
    router.post('/:id/break-unit', async (req, res) => {
        try {
            const vehicleId = req.params.id;
            const { inventoryId, unit, quantityToBreak, targetUnit } = req.body;

            if (!inventoryId || !unit || !quantityToBreak || !targetUnit) {
                return res.status(400).json({
                    error: 'inventoryId, unit, quantityToBreak, and targetUnit are required'
                });
            }

            const qtyToBreak = parseInt(quantityToBreak);
            if (qtyToBreak <= 0) {
                return res.status(400).json({ error: 'Invalid quantity to break' });
            }

            // Get all issuances for this vehicle
            const snapshot = await db.collection('stock-issuances')
                .where('vehicleId', '==', vehicleId)
                .get();

            if (snapshot.empty) {
                return res.status(404).json({ error: 'No issuances found for this vehicle' });
            }

            // Get the inventory item to find packaging structure and conversion ratio
            const inventoryDoc = await db.collection('inventory').doc(inventoryId).get();
            if (!inventoryDoc.exists) {
                return res.status(404).json({ error: 'Inventory item not found' });
            }

            const inventoryData = inventoryDoc.data();
            const packagingStructure = inventoryData.packagingStructure || [];

            // Find the source and target layers
            const sourceLayerIndex = findLayerIndexByUnit(packagingStructure, unit);
            const targetLayerIndex = findLayerIndexByUnit(packagingStructure, targetUnit);

            if (sourceLayerIndex === -1 || targetLayerIndex === -1) {
                return res.status(400).json({
                    error: 'Invalid unit or targetUnit for this product'
                });
            }

            // Calculate conversion ratio using calculations module
            let conversionRatio;
            try {
                conversionRatio = calculateUnitConversion(packagingStructure, sourceLayerIndex, targetLayerIndex);
            } catch (err) {
                return res.status(400).json({ error: err.message });
            }

            const unitsToCreate = qtyToBreak * conversionRatio;

            // Find and update issuances
            let totalAvailable = 0;
            const issuancesToUpdate = [];

            snapshot.docs.forEach(doc => {
                const issuance = doc.data();
                issuance.items.forEach((item, itemIndex) => {
                    if (item.inventoryId === inventoryId) {
                        item.layers.forEach((layer, layerIndex) => {
                            if (layer.unit === unit && layer.collected && layer.quantity > 0) {
                                totalAvailable += layer.quantity;
                                issuancesToUpdate.push({
                                    docId: doc.id,
                                    itemIndex,
                                    layerIndex,
                                    currentQty: layer.quantity,
                                    issuanceData: issuance
                                });
                            }
                        });
                    }
                });
            });

            if (totalAvailable < qtyToBreak) {
                return res.status(400).json({
                    error: `Insufficient ${unit} available. Have: ${totalAvailable}, Need: ${qtyToBreak}`
                });
            }

            // Perform the breakdown across issuances
            let remainingToBreak = qtyToBreak;
            const targetLayer = packagingStructure[targetLayerIndex];

            for (const update of issuancesToUpdate) {
                if (remainingToBreak <= 0) break;

                const toBreakFromThis = Math.min(remainingToBreak, update.currentQty);
                const unitsToAdd = toBreakFromThis * conversionRatio;

                const issuanceData = update.issuanceData;
                const item = issuanceData.items[update.itemIndex];

                // Reduce source layer quantity
                item.layers[update.layerIndex].quantity -= toBreakFromThis;

                // Find or create target layer
                const existingTargetLayerIndex = item.layers.findIndex(l => l.unit === targetUnit);

                if (existingTargetLayerIndex !== -1) {
                    // Target layer exists, add to it
                    item.layers[existingTargetLayerIndex].quantity += unitsToAdd;
                } else {
                    // Create new target layer with selling price from packaging structure
                    item.layers.push({
                        layerIndex: targetLayerIndex,
                        unit: targetUnit,
                        quantity: unitsToAdd,
                        sellingPrice: targetLayer.sellingPrice || 0,
                        collectedQty: unitsToAdd,
                        collected: true,
                        collectedAt: new Date().toISOString()
                    });
                }

                // Update the issuance document
                await db.collection('stock-issuances').doc(update.docId).update({
                    items: issuanceData.items,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });

                remainingToBreak -= toBreakFromThis;
            }

            res.json({
                success: true,
                message: `Broke ${qtyToBreak} ${unit} into ${unitsToCreate} ${targetUnit}`,
                breakdown: {
                    sourceUnit: unit,
                    targetUnit: targetUnit,
                    quantityBroken: qtyToBreak,
                    unitsCreated: unitsToCreate,
                    conversionRatio: conversionRatio
                }
            });
        } catch (err) {
            console.error('Unit breakdown error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
