"use strict";

const { db } = require("../config/firebaseConfig");
const functions = require("firebase-functions");
const { v4: uuidv4 } = require("uuid");

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// COMPLAINT OPERATIONS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Saves a new sanitation complaint to Firestore.
 *
 * Firestore path: complaints/{complaintId}
 *
 * @param {object} complaintData
 * @returns {Promise<string>} The generated complaint ID
 */
async function saveComplaint(complaintData) {
  const complaintId = uuidv4();
  const timestamp = new Date().toISOString();

  const docData = {
    complaintId,
    ...complaintData,
    status: "Open",
    createdAt: timestamp,
    updatedAt: timestamp,
    verificationStatus: null,
    assignedUnit: null,
    resolvedAt: null,
  };

  await db.collection("complaints").doc(complaintId).set(docData);

  console.info("Complaint saved", { complaintId, ward: complaintData.wardNumber });

  return complaintId;
}

/**
 * Retrieves a complaint by ID.
 *
 * @param {string} complaintId
 * @returns {Promise<object|null>}
 */
async function getComplaintById(complaintId) {
  const doc = await db.collection("complaints").doc(complaintId).get();
  if (!doc.exists) return null;
  return doc.data();
}

/**
 * Updates the status of a complaint.
 *
 * @param {string} complaintId
 * @param {string} status - "Open" | "In Progress" | "Resolved" | "Escalated"
 * @param {object} additionalFields - Optional extra fields to update
 */
async function updateComplaintStatus(complaintId, status, additionalFields = {}) {
  await db
    .collection("complaints")
    .doc(complaintId)
    .update({
      status,
      updatedAt: new Date().toISOString(),
      ...additionalFields,
    });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// COMPLAINT HISTORY (Predictive Risk)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Fetches complaint history for a ward over the past N days.
 *
 * @param {number} wardNumber
 * @param {number} daysBack - Look-back window in days (default 90)
 * @returns {Promise<Array<object>>}
 */
async function getWardComplaintHistory(wardNumber, daysBack = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const snapshot = await db
    .collection("complaints")
    .where("wardNumber", "==", wardNumber)
    .where("createdAt", ">=", cutoffDate.toISOString())
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  if (snapshot.empty) return [];

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    // Return only analytics-relevant fields to reduce Gemini token usage
    return {
      complaintId: data.complaintId,
      createdAt: data.createdAt,
      wasteType: data.analysisResult?.waste_type,
      severityScore: data.analysisResult?.severity_score,
      priorityScore: data.analysisResult?.priority_score,
      locationZone: data.analysisResult?.location_zone,
      status: data.status,
      source: data.source,
    };
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CLEANUP VERIFICATION
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Saves a cleanup verification record.
 *
 * Firestore path: verifications/{verificationId}
 *
 * @param {string} complaintId
 * @param {string} workerId
 * @param {object} verificationResult - AI verification output
 * @returns {Promise<string>} Verification document ID
 */
async function saveVerification(complaintId, workerId, verificationResult) {
  const verificationId = uuidv4();
  const timestamp = new Date().toISOString();

  await db.collection("verifications").doc(verificationId).set({
    verificationId,
    complaintId,
    workerId,
    verificationResult,
    createdAt: timestamp,
  });

  // Update parent complaint record
  if (verificationResult.verification_status === "Approved") {
    await updateComplaintStatus(complaintId, "Resolved", {
      resolvedAt: timestamp,
      verificationStatus: "Approved",
      resolvedBy: workerId,
    });
  } else {
    await updateComplaintStatus(complaintId, "Verification Failed", {
      verificationStatus: verificationResult.verification_status,
    });
  }

  return verificationId;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DISPOSAL UNITS (Agentic Workflow)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Finds the nearest specialized hazardous waste disposal unit to a location.
 *
 * Firestore path: disposalUnits/{unitId}
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} hazardType - Type of hazard detected
 * @returns {Promise<object|null>} Nearest disposal unit
 */
async function findNearestDisposalUnit(latitude, longitude, hazardType) {
  const snapshot = await db
    .collection("disposalUnits")
    .where("capabilities", "array-contains", hazardType)
    .where("isActive", "==", true)
    .get();

  if (snapshot.empty) {
    console.warn("No disposal units found for hazard type", { hazardType });
    return null;
  }

  const { haversineDistance } = require("../utils/distanceCalculator");

  let nearest = null;
  let minDist = Infinity;

  for (const doc of snapshot.docs) {
    const unit = doc.data();
    const dist = haversineDistance(
      latitude,
      longitude,
      unit.latitude,
      unit.longitude
    );
    if (dist < minDist) {
      minDist = dist;
      nearest = { ...unit, distanceMeters: Math.round(dist) };
    }
  }

  return nearest;
}

/**
 * Saves a hazard escalation record to Firestore.
 *
 * Firestore path: hazardEscalations/{escalationId}
 *
 * @param {string} complaintId
 * @param {object} escalationData
 * @returns {Promise<string>} Escalation document ID
 */
async function saveHazardEscalation(complaintId, escalationData) {
  const escalationId = uuidv4();
  await db.collection("hazardEscalations").doc(escalationId).set({
    escalationId,
    complaintId,
    ...escalationData,
    status: "Notified",
    createdAt: new Date().toISOString(),
  });
  return escalationId;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// HERITAGE RESTORATIONS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Saves a heritage restoration job record.
 *
 * Firestore path: heritageRestorations/{jobId}
 *
 * @param {object} restorationData
 * @returns {Promise<string>} Job document ID
 */
async function saveRestorationJob(restorationData) {
  const jobId = uuidv4();
  await db.collection("heritageRestorations").doc(jobId).set({
    jobId,
    ...restorationData,
    status: "Completed",
    createdAt: new Date().toISOString(),
  });
  return jobId;
}

module.exports = {
  saveComplaint,
  getComplaintById,
  updateComplaintStatus,
  getWardComplaintHistory,
  saveVerification,
  findNearestDisposalUnit,
  saveHazardEscalation,
  saveRestorationJob,
};
