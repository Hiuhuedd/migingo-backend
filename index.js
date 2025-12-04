require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json());

// ========== HELPER FUNCTIONS ==========

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

// ========== IMPORT ROUTERS ==========
const authRoutes = require('./routes/auth.routes')(db, admin, serializeTimestamp);
const inventoryRoutes = require('./routes/inventory.routes')(db, admin, serializeDoc);
const vehiclesRoutes = require('./routes/vehicles.routes')(db, admin, serializeDoc);
const suppliersRoutes = require('./routes/suppliers.routes')();
const issuanceRoutes = require('./routes/issuance.routes')(db, admin, serializeDoc);

// ========== MOUNT ROUTERS ==========
app.use('/api/auth', authRoutes);
app.use('/api/users', authRoutes); // User management also in auth routes
app.use('/api/inventory', inventoryRoutes);
app.use('/api/vehicles', vehiclesRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/stock-issuance', issuanceRoutes);
app.use('/api/stock-issuances', issuanceRoutes); // Alternative path

// ========== REAL-TIME INVENTORY STREAM ==========
let clients = [];

const startRealtimeListener = () => {
  console.log("Starting real-time inventory listener...");

  const query = db.collection('inventory').where('isActive', '==', true);

  const unsubscribe = query.onSnapshot((snapshot) => {
    const items = snapshot.docs.map(doc => serializeDoc(doc));

    console.log(`Pushing ${items.length} items to ${clients.length} clients`);

    clients.forEach(client => {
      client.res.write(`data: ${JSON.stringify(items)}\n\n`);
    });
  }, (error) => {
    console.error("Snapshot listener error:", error);
  });

  return unsubscribe;
};

startRealtimeListener();

app.get('/api/inventory/stream', (req, res) => {
  console.log("New client connected to /api/inventory/stream");

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  db.collection('inventory')
    .where('isActive', '==', true)
    .get()
    .then(snapshot => {
      const items = snapshot.docs.map(doc => serializeDoc(doc));
      console.log(`Sending initial ${items.length} items to new client`);
      res.write(`data: ${JSON.stringify(items)}\n\n`);
    })
    .catch(err => console.error("Initial data error:", err));

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  req.on('close', () => {
    console.log(`Client ${clientId} disconnected`);
    clients = clients.filter(c => c.id !== clientId);
  });
});

// ========== SERVER STARTUP ==========
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`MIGINGO BACKEND — FULLY OPEN (NO RESTRICTIONS)`);
  console.log(`http://localhost:${PORT}`);
  console.log(`Import, add, edit, delete — EVERYTHING WORKS FOR ANYONE`);
  console.log(`Stock issuance with packaging layers — ALL ENDPOINTS ACTIVE`);
  console.log(`Modular architecture with calculations module — READY`);
});