const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Helper function to serialize Firestore timestamps
const serializeTimestamp = (timestamp) => {
    if (!timestamp) return null;

    if (timestamp._seconds !== undefined) {
        return new Date(timestamp._seconds * 1000).toISOString();
    }

    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toISOString();
    }

    return timestamp;
};

// Helper function to serialize Firestore document
const serializeDoc = (doc) => {
    const data = doc.data();
    const serialized = { id: doc.id };

    for (const key in data) {
        const value = data[key];

        if (value && typeof value === 'object' && (value._seconds !== undefined || (value.toDate && typeof value.toDate === 'function'))) {
            serialized[key] = serializeTimestamp(value);
        } else {
            serialized[key] = value;
        }
    }

    return serialized;
};

async function debugVehicles() {
    try {
        console.log('Fetching vehicles...');
        const snapshot = await db.collection('vehicles').where('isActive', '==', true).get();
        console.log(`Found ${snapshot.size} vehicles`);

        snapshot.docs.forEach(doc => {
            try {
                console.log(`Serializing doc ${doc.id}...`);
                const serialized = serializeDoc(doc);
                console.log(`Serialized ${doc.id}:`, JSON.stringify(serialized, null, 2));
            } catch (e) {
                console.error(`Error serializing doc ${doc.id}:`, e);
            }
        });

        console.log('Done.');
    } catch (err) {
        console.error('Error fetching vehicles:', err);
    }
}

debugVehicles();
