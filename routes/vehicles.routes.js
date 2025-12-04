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

    return router;
};
