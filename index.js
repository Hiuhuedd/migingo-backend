// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const morgan = require('morgan');
// const admin = require('firebase-admin');

// const serviceAccount = require('./serviceAccountKey.json');
// const { parseSupplierItem } = require('./utils/universalSupplierParser');
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });

// const db = admin.firestore();
// const app = express();

// app.use(cors({ origin: '*' }));
// app.use(morgan('dev'));
// app.use(express.json());

// // Helper function to serialize Firestore timestamps
// const serializeTimestamp = (timestamp) => {
//   if (!timestamp) return null;
//   if (timestamp.toDate) {
//     return timestamp.toDate().toISOString();
//   }
//   return timestamp;
// };

// // Helper function to serialize Firestore document
// const serializeDoc = (doc) => {
//   const data = doc.data();
//   const serialized = { id: doc.id };
  
//   for (const [key, value] of Object.entries(data)) {
//     if (value && typeof value === 'object' && value.toDate) {
//       serialized[key] = serializeTimestamp(value);
//     } else if (Array.isArray(value)) {
//       serialized[key] = value.map(item => {
//         if (item && typeof item === 'object') {
//           const serializedItem = {};
//           for (const [k, v] of Object.entries(item)) {
//             serializedItem[k] = (v && typeof v === 'object' && v.toDate) ? serializeTimestamp(v) : v;
//           }
//           return serializedItem;
//         }
//         return item;
//       });
//     } else {
//       serialized[key] = value;
//     }
//   }
  
//   return serialized;
// };

// // PUBLIC: Supplier list
// app.get('/api/suppliers', (req, res) => {
//   try {
//     const data = require('./data/supplierItems.json');
//     res.json(data.items);
//   } catch (err) {
//     res.status(500).json({ error: 'Suppliers not found' });
//   }
// });

// // GET inventory
// app.get('/api/inventory', async (req, res) => {
//   try {
//     let query = db.collection('inventory').where('isActive', '==', true);
//     if (req.query.search) {
//       const term = req.query.search.toLowerCase();
//       query = query.where('productNameLower', '>=', term).where('productNameLower', '<=', term + '\uf8ff');
//     }
//     if (req.query.category && req.query.category !== 'all') {
//       query = query.where('category', '==', req.query.category);
//     }
//     const snapshot = await query.orderBy('productNameLower').get();
//     const items = snapshot.docs.map(doc => serializeDoc(doc));
//     res.json(items);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // ADD inventory item
// app.post('/api/inventory', async (req, res) => {
//   try {
//     const existingSnapshot = await db.collection('inventory')
//       .where('productNameLower', '==', req.body.productName.toLowerCase())
//       .where('isActive', '==', true)
//       .get();

//     if (!existingSnapshot.empty) {
//       return res.status(400).json({
//         error: 'Duplicate product name',
//         message: `Item "${req.body.productName}" already exists in inventory`
//       });
//     }

//     const data = {
//       ...req.body,
//       productNameLower: (req.body.productName || '').toLowerCase(),
//       isActive: true,
//       hasSubUnits: req.body.hasSubUnits || false,
//       subUnitName: req.body.subUnitName || "",
//       subUnitsPerSupplierUnit: req.body.subUnitsPerSupplierUnit || 0,
//       piecesPerSubUnit: req.body.piecesPerSubUnit || 0,
//       sellingPricePerSubUnit: req.body.sellingPricePerSubUnit || 0,
//       stockInSubUnits: req.body.stockInSubUnits || 0,
//       dateAdded: admin.firestore.FieldValue.serverTimestamp(),
//       lastUpdated: admin.firestore.FieldValue.serverTimestamp()
//     };

//     const ref = await db.collection('inventory').add(data);
//     res.status(201).json({ id: ref.id, ...data });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // UPDATE inventory item
// app.put('/api/inventory/:id', async (req, res) => {
//   try {
//     const data = {
//       ...req.body,
//       productNameLower: (req.body.productName || '').toLowerCase(),
//       hasSubUnits: req.body.hasSubUnits || false,
//       subUnitName: req.body.subUnitName || "",
//       subUnitsPerSupplierUnit: req.body.subUnitsPerSupplierUnit || 0,
//       piecesPerSubUnit: req.body.piecesPerSubUnit || 0,
//       sellingPricePerSubUnit: req.body.sellingPricePerSubUnit || 0,
//       stockInSubUnits: req.body.stockInSubUnits || 0,
//       lastUpdated: admin.firestore.FieldValue.serverTimestamp()
//     };

//     await db.collection('inventory').doc(req.params.id).update(data);
//     res.json({ success: true });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // DELETE inventory item (soft delete)
// app.delete('/api/inventory/:id', async (req, res) => {
//   try {
//     await db.collection('inventory').doc(req.params.id).update({
//       isActive: false,
//       lastUpdated: admin.firestore.FieldValue.serverTimestamp()
//     });
//     res.json({ success: true });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // IMPORT from supplier
// app.post('/api/inventory/import', async (req, res) => {
//   const { supplierItem } = req.body;
//   const { name, price, supplier = "Unknown", category = "misc" } = supplierItem;

//   try {
//     const cleanName = name.replace(/\d+\s*[xX×]\s*\d+\s*(PCS?|PIECES?|POUCHES?|SACHETS?|GM|GMS|KG|ML|L)?/gi, '').trim();
//     const existingSnapshot = await db.collection('inventory')
//       .where('productNameLower', '==', cleanName.toLowerCase())
//       .where('isActive', '==', true)
//       .get();

//     if (!existingSnapshot.empty) {
//       return res.status(400).json({
//         error: 'Duplicate product name',
//         message: `Item "${cleanName}" already exists in inventory`
//       });
//     }

//     const parsed = parseSupplierItem(name, price);

//     const newItem = {
//       productName: parsed.productName,
//       supplier,
//       category,
//       buyingPricePerUnit: price,
//       supplierUnit: parsed.supplierUnit,
//       supplierUnitQuantity: parsed.totalSellableUnits,
//       sellingPricePerPiece: 0,
//       sellingPricePerSubUnit: 0,
//       stockInSupplierUnits: 0,
//       stockInSubUnits: 0,
//       lowStockAlert: 5,
//       isActive: true,
//       hasSubUnits: parsed.packagingType === "nested",
//       subUnitName: parsed.packagingStructure?.outer?.unit || "",
//       subUnitsPerSupplierUnit: parsed.packagingStructure?.outer?.quantity || 0,
//       piecesPerSubUnit: parsed.packagingStructure?.inner?.quantity || 0,
//       productNameLower: parsed.productName.toLowerCase(),
//       dateAdded: admin.firestore.FieldValue.serverTimestamp(),
//       lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
//     };

//     const ref = await db.collection('inventory').add(newItem);
//     res.status(201).json({ id: ref.id, ...newItem });
//   } catch (err) {
//     console.error("Import error:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

// // BREAK UNIT Endpoint
// app.post('/api/inventory/:id/break', async (req, res) => {
//   try {
//     const { quantity } = req.body; // quantity of master units to break (default 1)
//     const qtyToBreak = parseInt(quantity) || 1;

//     if (qtyToBreak <= 0) return res.status(400).json({ error: 'Invalid quantity' });

//     await db.runTransaction(async (t) => {
//       const docRef = db.collection('inventory').doc(req.params.id);
//       const doc = await t.get(docRef);

//       if (!doc.exists) throw new Error('Item not found');

//       const data = doc.data();
//       const packaging = data.packagingStructure;

//       // Case 1: Array-based structure
//       if (packaging && Array.isArray(packaging) && packaging.length >= 2) {
//         const masterIdx = 0;
//         const subIdx = 1;

//         const masterStock = packaging[masterIdx].stock || 0;
//         if (masterStock < qtyToBreak) {
//           throw new Error('Insufficient master units to break');
//         }

//         // Try to get conversion from root field, or fallback to 2nd layer 'qty'
//         let conversion = data.subUnitsPerSupplierUnit;
//         if (!conversion && packaging[subIdx].qty) {
//           conversion = packaging[subIdx].qty;
//         }

//         if (!conversion || conversion <= 0) {
//           throw new Error('Invalid conversion rate defined for item');
//         }

//         const subUnitsToAdd = qtyToBreak * conversion;

//         packaging[masterIdx].stock = masterStock - qtyToBreak;
//         packaging[subIdx].stock = (packaging[subIdx].stock || 0) + subUnitsToAdd;

//         t.update(docRef, {
//           packagingStructure: packaging,
//           lastUpdated: admin.firestore.FieldValue.serverTimestamp()
//         });
//         return;
//       }

//       // Case 2: Flat structure (Legacy)
//       // Check if we have enough info to break
//       if (data.hasSubUnits && data.subUnitsPerSupplierUnit > 0) {
//         const masterStock = data.stockInSupplierUnits || 0;
//         if (masterStock < qtyToBreak) {
//           throw new Error('Insufficient master units to break');
//         }

//         const subUnitsToAdd = qtyToBreak * data.subUnitsPerSupplierUnit;

//         t.update(docRef, {
//           stockInSupplierUnits: masterStock - qtyToBreak,
//           stockInSubUnits: (data.stockInSubUnits || 0) + subUnitsToAdd,
//           lastUpdated: admin.firestore.FieldValue.serverTimestamp()
//         });
//         return;
//       }

//       throw new Error('Item does not support breaking units');
//     });

//     res.json({ success: true, message: 'Unit broken successfully' });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });



// // ========== VEHICLES ==========
// app.get('/api/vehicles', async (req, res) => {
//   try {
//     const snapshot = await db.collection('vehicles').where('isActive', '==', true).get();
//     const vehicles = snapshot.docs.map(doc => serializeDoc(doc));
//     res.json(vehicles);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// app.post('/api/vehicles', async (req, res) => {
//   try {
//     const { vehicleName, registrationNumber, salesTeamMember } = req.body;
//     const data = {
//       vehicleName,
//       registrationNumber,
//       salesTeamMember,
//       isActive: true,
//       dateCreated: admin.firestore.FieldValue.serverTimestamp(),
//     };
//     const ref = await db.collection('vehicles').add(data);
//     res.status(201).json({ id: ref.id, ...data });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// app.get('/api/vehicles/:id', async (req, res) => {
//   try {
//     const doc = await db.collection('vehicles').doc(req.params.id).get();
//     if (!doc.exists) return res.status(404).json({ error: 'Vehicle not found' });
//     res.json(serializeDoc(doc));
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // ========== STOCK ISSUANCE ==========
// app.post('/api/stock-issuance', async (req, res) => {
//   try {
//     const { vehicleId, items } = req.body;

//     if (!vehicleId || !items || items.length === 0) {
//       return res.status(400).json({ error: 'vehicleId and items required' });
//     }

//     const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
//     if (!vehicleDoc.exists) {
//       return res.status(404).json({ error: 'Vehicle not found' });
//     }

//     const issuanceRef = db.collection('stock-issuances').doc();
//     const issuanceData = {
//       vehicleId,
//       items: [],
//       status: 'issued',
//       issuedAt: admin.firestore.FieldValue.serverTimestamp(),
//       collectedAt: null,
//       notes: req.body.notes || '',
//     };

//     // Process each item with packaging structure support
//     for (const itemToIssue of items) {
//       const { inventoryId, layers } = itemToIssue; // layers = [{layerIndex, quantity}]
      
//       const inventoryDoc = await db.collection('inventory').doc(inventoryId).get();
//       if (!inventoryDoc.exists) {
//         return res.status(404).json({ error: `Inventory item ${inventoryId} not found` });
//       }

//       const inventoryData = inventoryDoc.data();
//       const packagingStructure = inventoryData.packagingStructure || [];
      
//       // Validate stock availability for each layer
//       for (const layer of layers) {
//         const { layerIndex, quantity } = layer;
//         const packagingLayer = packagingStructure[layerIndex];
        
//         if (!packagingLayer) {
//           return res.status(400).json({
//             error: `Invalid layer index ${layerIndex} for ${inventoryData.productName}`
//           });
//         }

//         const currentStock = packagingLayer.stock || 0;
//         if (currentStock < quantity) {
//           return res.status(400).json({
//             error: `Insufficient stock for ${inventoryData.productName} - ${packagingLayer.unit}`,
//             available: currentStock,
//             requested: quantity
//           });
//         }
//       }

//       // Update inventory - subtract from each layer
//       const updatedPackaging = [...packagingStructure];
//       for (const layer of layers) {
//         const { layerIndex, quantity } = layer;
//         updatedPackaging[layerIndex] = {
//           ...updatedPackaging[layerIndex],
//           stock: (updatedPackaging[layerIndex].stock || 0) - quantity
//         };
//       }

//       await db.collection('inventory').doc(inventoryId).update({
//         packagingStructure: updatedPackaging,
//         lastUpdated: admin.firestore.FieldValue.serverTimestamp()
//       });

//       // Add to issuance record with layer details
//       issuanceData.items.push({
//         inventoryId,
//         productName: inventoryData.productName,
//         layers: layers.map(l => ({
//           layerIndex: l.layerIndex,
//           unit: packagingStructure[l.layerIndex].unit,
//           quantity: l.quantity,
//           collectedQty: 0,
//           collected: false,
//           collectedAt: null
//         })),
//         buyingPrice: inventoryData.buyingPricePerUnit || 0,
//       });
//     }

//     await issuanceRef.set(issuanceData);
    
//     const createdDoc = await issuanceRef.get();
//     res.status(201).json(serializeDoc(createdDoc));
//   } catch (err) {
//     console.error('Stock issuance error:', err);
//     res.status(500).json({ error: err.message });
//   }
// });

// // GET issuances for vehicle
// app.get('/api/vehicles/:vehicleId/issuances', async (req, res) => {
//   try {
//     const snapshot = await db.collection('stock-issuances')
//       .where('vehicleId', '==', req.params.vehicleId)
//       .orderBy('issuedAt', 'desc')
//       .get();
    
//     const issuances = snapshot.docs.map(doc => serializeDoc(doc));
//     res.json(issuances);
//   } catch (err) {
//     console.error('Error fetching issuances:', err);
//     res.status(500).json({ error: err.message });
//   }
// });

// // PATCH mark issuance item layer as collected
// app.patch('/api/stock-issuance/:issuanceId/item/:itemIndex/layer/:layerIndex/collect', async (req, res) => {
//   try {
//     const { issuanceId, itemIndex, layerIndex } = req.params;
//     const issuanceDoc = await db.collection('stock-issuances').doc(issuanceId).get();

//     if (!issuanceDoc.exists) {
//       return res.status(404).json({ error: 'Issuance not found' });
//     }

//     const issuanceData = issuanceDoc.data();
//     const item = issuanceData.items[parseInt(itemIndex)];

//     if (!item) {
//       return res.status(404).json({ error: 'Item not found in issuance' });
//     }

//     const layer = item.layers[parseInt(layerIndex)];
//     if (!layer) {
//       return res.status(404).json({ error: 'Layer not found' });
//     }

//     // Mark layer as collected
//     layer.collected = true;
//     layer.collectedQty = layer.quantity;
//     layer.collectedAt = admin.firestore.FieldValue.serverTimestamp();

//     // Check if all items' all layers are collected
//     const allCollected = issuanceData.items.every(i => 
//       i.layers.every(l => l.collected)
//     );

//     await db.collection('stock-issuances').doc(issuanceId).update({
//       items: issuanceData.items,
//       status: allCollected ? 'collected' : 'partial',
//       collectedAt: allCollected ? admin.firestore.FieldValue.serverTimestamp() : null,
//     });

//     res.json({ success: true, status: allCollected ? 'collected' : 'partial' });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // ========== REAL-TIME INVENTORY STREAM ==========
// let clients = [];

// const startRealtimeListener = () => {
//   console.log("Starting real-time inventory listener...");

//   const query = db.collection('inventory').where('isActive', '==', true);

//   const unsubscribe = query.onSnapshot((snapshot) => {
//     const items = snapshot.docs.map(doc => serializeDoc(doc));

//     console.log(`Pushing ${items.length} items to ${clients.length} clients`);

//     clients.forEach(client => {
//       client.res.write(`data: ${JSON.stringify(items)}\n\n`);
//     });
//   }, (error) => {
//     console.error("Snapshot listener error:", error);
//   });

//   return unsubscribe;
// };

// startRealtimeListener();

// app.get('/api/inventory/stream', (req, res) => {
//   console.log("New client connected to /api/inventory/stream");

//   res.setHeader('Content-Type', 'text/event-stream');
//   res.setHeader('Cache-Control', 'no-cache');
//   res.setHeader('Connection', 'keep-alive');
//   res.flushHeaders();

//   db.collection('inventory')
//     .where('isActive', '==', true)
//     .get()
//     .then(snapshot => {
//       const items = snapshot.docs.map(doc => serializeDoc(doc));
//       console.log(`Sending initial ${items.length} items to new client`);
//       res.write(`data: ${JSON.stringify(items)}\n\n`);
//     })
//     .catch(err => console.error("Initial data error:", err));

//   const clientId = Date.now();
//   const newClient = { id: clientId, res };
//   clients.push(newClient);

//   req.on('close', () => {
//     console.log(`Client ${clientId} disconnected`);
//     clients = clients.filter(c => c.id !== clientId);
//   });
// });

// const PORT = 8080;
// app.listen(PORT, () => {
//   console.log(`MIGINGO BACKEND — FULLY OPEN (NO RESTRICTIONS)`);
//   console.log(`http://localhost:${PORT}`);
//   console.log(`Import, add, edit, delete — EVERYTHING WORKS FOR ANYONE`);
//   console.log(`Stock issuance with packaging layers — ALL ENDPOINTS ACTIVE`);
// });

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');
const { parseSupplierItem } = require('./utils/universalSupplierParser');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json());

// Helper function to serialize Firestore timestamps
const serializeTimestamp = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp.toDate) {
    return timestamp.toDate().toISOString();
  }
  return timestamp;
};

// Helper function to serialize Firestore document
const serializeDoc = (doc) => {
  const data = doc.data();
  const serialized = { id: doc.id };

  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && value.toDate) {
      serialized[key] = serializeTimestamp(value);
    } else if (Array.isArray(value)) {
      serialized[key] = value.map(item => {
        if (item && typeof item === 'object') {
          const serializedItem = {};
          for (const [k, v] of Object.entries(item)) {
            serializedItem[k] = (v && typeof v === 'object' && v.toDate) ? serializeTimestamp(v) : v;
          }
          return serializedItem;
        }
        return item;
      });
    } else {
      serialized[key] = value;
    }
  }

  return serialized;
};

// ========== USER AUTHENTICATION & MANAGEMENT ==========

// Register new sales team member
app.post('/api/auth/register', async (req, res) => {
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
app.post('/api/auth/login', async (req, res) => {
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
app.get('/api/users', async (req, res) => {
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
app.patch('/api/users/:id/verify', async (req, res) => {
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
app.patch('/api/users/:id/assign-vehicle', async (req, res) => {
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

// ========== INVENTORY ==========

// Get suppliers
app.get('/api/suppliers', (req, res) => {
  try {
    const data = require('./data/supplierItems.json');
    res.json(data.items);
  } catch (err) {
    res.status(500).json({ error: 'Suppliers not found' });
  }
});

// Get inventory
app.get('/api/inventory', async (req, res) => {
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

// Add inventory item
app.post('/api/inventory', async (req, res) => {
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
      dateAdded: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    const ref = await db.collection('inventory').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update inventory item
app.put('/api/inventory/:id', async (req, res) => {
  try {
    const data = {
      ...req.body,
      productNameLower: (req.body.productName || '').toLowerCase(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('inventory').doc(req.params.id).update(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Break unit
app.post('/api/inventory/:id/break', async (req, res) => {
  try {
    const { quantity } = req.body;
    const qtyToBreak = parseInt(quantity) || 1;

    if (qtyToBreak <= 0) return res.status(400).json({ error: 'Invalid quantity' });

    await db.runTransaction(async (t) => {
      const docRef = db.collection('inventory').doc(req.params.id);
      const doc = await t.get(docRef);

      if (!doc.exists) throw new Error('Item not found');

      const data = doc.data();
      const packaging = data.packagingStructure;

      if (packaging && Array.isArray(packaging) && packaging.length >= 2) {
        const masterIdx = 0;
        const subIdx = 1;

        const masterStock = packaging[masterIdx].stock || 0;
        if (masterStock < qtyToBreak) {
          throw new Error('Insufficient master units to break');
        }

        let conversion = data.subUnitsPerSupplierUnit;
        if (!conversion && packaging[subIdx].qty) {
          conversion = packaging[subIdx].qty;
        }

        if (!conversion || conversion <= 0) {
          throw new Error('Invalid conversion rate defined for item');
        }

        const subUnitsToAdd = qtyToBreak * conversion;

        packaging[masterIdx].stock = masterStock - qtyToBreak;
        packaging[subIdx].stock = (packaging[subIdx].stock || 0) + subUnitsToAdd;

        t.update(docRef, {
          packagingStructure: packaging,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        return;
      }

      if (data.hasSubUnits && data.subUnitsPerSupplierUnit > 0) {
        const masterStock = data.stockInSupplierUnits || 0;
        if (masterStock < qtyToBreak) {
          throw new Error('Insufficient master units to break');
        }

        const subUnitsToAdd = qtyToBreak * data.subUnitsPerSupplierUnit;

        t.update(docRef, {
          stockInSupplierUnits: masterStock - qtyToBreak,
          stockInSubUnits: (data.stockInSubUnits || 0) + subUnitsToAdd,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        return;
      }

      throw new Error('Item does not support breaking units');
    });

    res.json({ success: true, message: 'Unit broken successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ========== VEHICLES ==========

app.get('/api/vehicles', async (req, res) => {
  try {
    const snapshot = await db.collection('vehicles').where('isActive', '==', true).get();
    const vehicles = snapshot.docs.map(doc => serializeDoc(doc));
    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vehicles', async (req, res) => {
  try {
    const { registrationNumber, vehicleName } = req.body;

    if (!registrationNumber) {
      return res.status(400).json({ error: 'Registration number is required' });
    }

    const data = {
      registrationNumber,
      vehicleName: vehicleName || '',
      isActive: true,
      dateCreated: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('vehicles').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vehicles/:id', async (req, res) => {
  try {
    const doc = await db.collection('vehicles').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(serializeDoc(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== STOCK ISSUANCE ==========

app.post('/api/stock-issuance', async (req, res) => {
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

    for (const itemToIssue of items) {
      const { inventoryId, layers } = itemToIssue;

      const inventoryDoc = await db.collection('inventory').doc(inventoryId).get();
      if (!inventoryDoc.exists) {
        return res.status(404).json({ error: `Inventory item ${inventoryId} not found` });
      }

      const inventoryData = inventoryDoc.data();
      const packagingStructure = inventoryData.packagingStructure || [];

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

      // Pass selling prices with layers
      issuanceData.items.push({
        inventoryId,
        productName: inventoryData.productName,
        layers: layers.map(l => ({
          layerIndex: l.layerIndex,
          unit: packagingStructure[l.layerIndex].unit,
          quantity: l.quantity,
          sellingPrice: packagingStructure[l.layerIndex].sellingPrice || 0,
          collectedQty: 0,
          collected: false,
          collectedAt: null
        })),
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

app.get('/api/vehicles/:vehicleId/issuances', async (req, res) => {
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

app.patch('/api/stock-issuance/:issuanceId/item/:itemIndex/layer/:layerIndex/collect', async (req, res) => {
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

    layer.collected = true;
    layer.collectedQty = layer.quantity;
    layer.collectedAt = new Date().toISOString();

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
    console.error('Collection error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get collected items for a vehicle (for sales)
app.get('/api/vehicles/:vehicleId/collected-items', async (req, res) => {
  try {
    const snapshot = await db.collection('stock-issuances')
      .where('vehicleId', '==', req.params.vehicleId)
      .get();

    const collectedItems = [];
    const itemsMap = new Map();

    snapshot.docs.forEach(doc => {
      const issuance = doc.data();
      issuance.items.forEach(item => {
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
              });
            }
          }
        });
      });
    });

    collectedItems.push(...itemsMap.values());
    res.json(collectedItems);
  } catch (err) {
    console.error('Error fetching collected items:', err);
    res.status(500).json({ error: err.message });
  }
});

//==========  REAL-TIME INVENTORY STREAM ==========
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

const PORT = 8080;
app.listen(PORT, () => {
  console.log(`MIGINGO BACKEND — FULLY OPEN (NO RESTRICTIONS)`);
  console.log(`http://localhost:${PORT}`);
  console.log(`Import, add, edit, delete — EVERYTHING WORKS FOR ANYONE`);
  console.log(`Stock issuance with packaging layers — ALL ENDPOINTS ACTIVE`);
  console.log(`User authentication and management — ACTIVE`);
});