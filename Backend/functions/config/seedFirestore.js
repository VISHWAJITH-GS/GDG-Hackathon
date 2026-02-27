/**
 * Seed script: Populates Firestore with Madurai disposal units.
 * Run once during project setup:
 *   node functions/config/seedFirestore.js
 */

"use strict";

const admin = require("firebase-admin");

// Initialize with service account key for local seeding
// Replace with your actual service account key path
const serviceAccount = require("../../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const disposalUnits = [
  {
    unitId: "unit-001",
    name: "Madurai CMWSSB Biomedical Waste Unit",
    contactPhone: "+914522530530",
    contactEmail: "biomedical@cmwssb-madurai.gov.in",
    latitude: 9.9156,
    longitude: 78.1106,
    address: "CMWSSB Office, Anna Nagar, Madurai",
    capabilities: ["Biomedical Waste", "Chemical/Hazardous Waste"],
    operatingHours: "24/7",
    isActive: true,
    wardsCovered: [1, 2, 3, 4, 5, 6, 7, 8],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    unitId: "unit-002",
    name: "Madurai Corporation Animal Control Unit",
    contactPhone: "+914522335577",
    contactEmail: "animalcontrol@madurai-municipal.gov.in",
    latitude: 9.9320,
    longitude: 78.1280,
    address: "Corporation Veterinary Office, Mattuthavani, Madurai",
    capabilities: ["Dead Animal Removal", "Biological Hazard"],
    operatingHours: "6am-10pm",
    isActive: true,
    wardsCovered: [1, 2, 3, 4, 5, 10, 11, 12, 15],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    unitId: "unit-003",
    name: "Tamil Nadu Pollution Control Board — Madurai",
    contactPhone: "+914522340340",
    contactEmail: "tnpcb.madurai@tn.gov.in",
    latitude: 9.9410,
    longitude: 78.1380,
    address: "TNPCB Regional Office, KK Nagar, Madurai",
    capabilities: ["Chemical/Hazardous Waste", "Industrial Waste"],
    operatingHours: "9am-6pm Mon-Fri",
    isActive: true,
    wardsCovered: [20, 21, 22, 23, 24, 25],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    unitId: "unit-004",
    name: "Madurai Emergency Sanitation Response Unit",
    contactPhone: "+914522523000",
    contactEmail: "emergency@madurai-municipal.gov.in",
    latitude: 9.9196,
    longitude: 78.1193,
    address: "Madurai Municipal Corporation HQ, Madurai",
    capabilities: [
      "Biomedical Waste",
      "Dead Animal Removal",
      "Chemical/Hazardous Waste",
      "Biological Hazard",
      "General Hazardous Waste",
    ],
    operatingHours: "24/7",
    isActive: true,
    wardsCovered: [],  // Covers all wards as emergency fallback
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

async function seed() {
  console.log("Seeding Firestore disposal units...");
  const batch = db.batch();

  for (const unit of disposalUnits) {
    const ref = db.collection("disposalUnits").doc(unit.unitId);
    batch.set(ref, unit);
    console.log(`  Queued: ${unit.name}`);
  }

  await batch.commit();
  console.log(`\nSeeded ${disposalUnits.length} disposal units successfully.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
