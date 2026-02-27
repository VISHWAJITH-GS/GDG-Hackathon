"use strict";

const admin = require("firebase-admin");

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();

module.exports = { admin, db, storage };
