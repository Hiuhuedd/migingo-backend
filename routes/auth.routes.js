const express = require('express');
const router = express.Router();

/**
 * Authentication & User Management Routes
 */

module.exports = (db, admin, serializeTimestamp) => {
    // Register new sales team member
    router.post('/register', async (req, res) => {
        try {
            const { email, password, username } = req.body;

            if (!email || !password || !username) {
                return res.status(400).json({ error: 'Email, password, and username are required' });
            }

            const existingUser = await db.collection('users')
                .where('email', '==', email.toLowerCase())
                .get();

            if (!existingUser.empty) {
                return res.status(400).json({ error: 'User with this email already exists' });
            }

            const userRecord = await admin.auth().createUser({
                email: email.toLowerCase(),
                password: password,
                displayName: username
            });

            const userData = {
                uid: userRecord.uid,
                email: email.toLowerCase(),
                username: username,
                isVerified: false,
                assignedVehicleId: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('users').doc(userRecord.uid).set(userData);

            res.status(201).json({
                success: true,
                message: 'Registration successful. Please wait for admin verification.',
                user: {
                    uid: userRecord.uid,
                    email: userData.email,
                    username: userData.username,
                    isVerified: false
                }
            });
        } catch (err) {
            console.error('Registration error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Login
    router.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            let userRecord;
            try {
                userRecord = await admin.auth().getUserByEmail(email.toLowerCase());
            } catch (err) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const userDoc = await db.collection('users').doc(userRecord.uid).get();

            if (!userDoc.exists) {
                return res.status(401).json({ error: 'User not found' });
            }

            const userData = userDoc.data();
            const customToken = await admin.auth().createCustomToken(userRecord.uid);

            res.json({
                success: true,
                token: customToken,
                user: {
                    uid: userRecord.uid,
                    email: userData.email,
                    username: userData.username,
                    isVerified: userData.isVerified,
                    assignedVehicleId: userData.assignedVehicleId
                }
            });
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Get all users
    router.get('/', async (req, res) => {
        try {
            const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
            const users = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    uid: data.uid,
                    email: data.email,
                    username: data.username,
                    isVerified: data.isVerified,
                    assignedVehicleId: data.assignedVehicleId,
                    createdAt: serializeTimestamp(data.createdAt),
                    updatedAt: serializeTimestamp(data.updatedAt)
                };
            });
            res.json(users);
        } catch (err) {
            console.error('Error fetching users:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Toggle user verification
    router.patch('/:id/verify', async (req, res) => {
        try {
            const { isVerified } = req.body;

            if (typeof isVerified !== 'boolean') {
                return res.status(400).json({ error: 'isVerified must be a boolean' });
            }

            await db.collection('users').doc(req.params.id).update({
                isVerified: isVerified,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            res.json({ success: true, message: `User ${isVerified ? 'verified' : 'unverified'} successfully` });
        } catch (err) {
            console.error('Error updating verification:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Assign vehicle to user
    router.patch('/:id/assign-vehicle', async (req, res) => {
        try {
            const { vehicleId } = req.body;

            if (vehicleId !== null) {
                const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
                if (!vehicleDoc.exists) {
                    return res.status(404).json({ error: 'Vehicle not found' });
                }

                const assignedUser = await db.collection('users')
                    .where('assignedVehicleId', '==', vehicleId)
                    .get();

                if (!assignedUser.empty && assignedUser.docs[0].id !== req.params.id) {
                    return res.status(400).json({ error: 'Vehicle is already assigned to another user' });
                }
            }

            await db.collection('users').doc(req.params.id).update({
                assignedVehicleId: vehicleId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            res.json({
                success: true,
                message: vehicleId ? 'Vehicle assigned successfully' : 'Vehicle unassigned successfully'
            });
        } catch (err) {
            console.error('Error assigning vehicle:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
