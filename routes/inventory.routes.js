const express = require('express');
const router = express.Router();
const { parseSupplierItem } = require('../utils/universalSupplierParser');

/**
 * Inventory Management Routes
 */

module.exports = (db, admin, serializeDoc) => {
    // GET inventory
    router.get('/', async (req, res) => {
        try {
            let query = db.collection('inventory').where('isActive', '==', true);
            if (req.query.search) {
                const term = req.query.search.toLowerCase();
                query = query.where('productNameLower', '>=', term).where('productNameLower', '<=', term + '\uf8ff');
            }
            if (req.query.category && req.query.category !== 'all') {
                query = query.where('category', '==', req.query.category);
            }
            const snapshot = await query.orderBy('productNameLower').get();
            const items = snapshot.docs.map(doc => serializeDoc(doc));
            res.json(items);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ADD inventory item
    router.post('/', async (req, res) => {
        try {
            const existingSnapshot = await db.collection('inventory')
                .where('productNameLower', '==', req.body.productName.toLowerCase())
                .where('isActive', '==', true)
                .get();

            if (!existingSnapshot.empty) {
                return res.status(400).json({
                    error: 'Duplicate product name',
                    message: `Item "${req.body.productName}" already exists in inventory`
                });
            }

            const data = {
                ...req.body,
                productNameLower: (req.body.productName || '').toLowerCase(),
                isActive: true,
                hasSubUnits: req.body.hasSubUnits || false,
                subUnitName: req.body.subUnitName || "",
                subUnitsPerSupplierUnit: req.body.subUnitsPerSupplierUnit || 0,
                piecesPerSubUnit: req.body.piecesPerSubUnit || 0,
                sellingPricePerSubUnit: req.body.sellingPricePerSubUnit || 0,
                stockInSubUnits: req.body.stockInSubUnits || 0,
                dateAdded: admin.firestore.FieldValue.serverTimestamp(),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            };

            const ref = await db.collection('inventory').add(data);
            res.status(201).json({ id: ref.id, ...data });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // UPDATE inventory item
    router.put('/:id', async (req, res) => {
        try {
            const data = {
                ...req.body,
                productNameLower: (req.body.productName || '').toLowerCase(),
                hasSubUnits: req.body.hasSubUnits || false,
                subUnitName: req.body.subUnitName || "",
                subUnitsPerSupplierUnit: req.body.subUnitsPerSupplierUnit || 0,
                piecesPerSubUnit: req.body.piecesPerSubUnit || 0,
                sellingPricePerSubUnit: req.body.sellingPricePerSubUnit || 0,
                stockInSubUnits: req.body.stockInSubUnits || 0,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('inventory').doc(req.params.id).update(data);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE inventory item (soft delete)
    router.delete('/:id', async (req, res) => {
        try {
            await db.collection('inventory').doc(req.params.id).update({
                isActive: false,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // IMPORT from supplier
    router.post('/import', async (req, res) => {
        const { supplierItem } = req.body;
        const { name, price, supplier = "Unknown", category = "misc" } = supplierItem;

        try {
            const cleanName = name.replace(/\d+\s*[xX×]\s*\d+\s*(PCS?|PIECES?|POUCHES?|SACHETS?|GM|GMS|KG|ML|L)?/gi, '').trim();
            const existingSnapshot = await db.collection('inventory')
                .where('productNameLower', '==', cleanName.toLowerCase())
                .where('isActive', '==', true)
                .get();

            if (!existingSnapshot.empty) {
                return res.status(400).json({
                    error: 'Duplicate product name',
                    message: `Item "${cleanName}" already exists in inventory`
                });
            }

            const parsed = parseSupplierItem(name, price);

            const newItem = {
                productName: parsed.productName,
                supplier,
                category,
                buyingPricePerUnit: price,
                supplierUnit: parsed.supplierUnit,
                supplierUnitQuantity: parsed.totalSellableUnits,
                sellingPricePerPiece: 0,
                sellingPricePerSubUnit: 0,
                stockInSupplierUnits: 0,
                stockInSubUnits: 0,
                lowStockAlert: 5,
                isActive: true,
                hasSubUnits: parsed.packagingType === "nested",
                subUnitName: parsed.packagingStructure?.outer?.unit || "",
                subUnitsPerSupplierUnit: parsed.packagingStructure?.outer?.quantity || 0,
                piecesPerSubUnit: parsed.packagingStructure?.inner?.quantity || 0,
                productNameLower: parsed.productName.toLowerCase(),
                dateAdded: admin.firestore.FieldValue.serverTimestamp(),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            };

            const ref = await db.collection('inventory').add(newItem);
            res.status(201).json({ id: ref.id, ...newItem });
        } catch (err) {
            console.error("Import error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
