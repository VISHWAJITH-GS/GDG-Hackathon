"use strict";

const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { v4: uuidv4 } = require("uuid");

const HAZARD_TYPES = new Set([
  "dead animal",
  "biomedical waste",
  "hazardous waste",
  "chemical waste",
  "biological hazard",
]);

/**
 * Determines whether an AI analysis result contains a hazardous detection.
 *
 * @param {object} analysisResult - Output from aiService.analyzeWasteImage()
 * @returns {boolean}
 */
function isHazardous(analysisResult) {
  if (!analysisResult) return false;

  // Check waste_type
  if (
    analysisResult.waste_type &&
    analysisResult.waste_type.toLowerCase().includes("hazard")
  ) {
    return true;
  }

  // Check is_hazard flag returned by AI
  if (analysisResult.is_hazard === true) {
    return true;
  }

  // Check detected_items for hazardous keywords
  if (Array.isArray(analysisResult.detected_items)) {
    for (const item of analysisResult.detected_items) {
      if (HAZARD_TYPES.has(item.toLowerCase())) return true;
    }
  }

  return false;
}

/**
 * Handles a confirmed biological/chemical hazard:
 * 1. Classifies as "Biological Hazard"
 * 2. Saves to Firestore hazardAlerts collection
 * 3. Logs a console alert (no external notifications per budget constraint)
 * 4. Returns a confirmation object
 *
 * @param {object} analysisResult - AI analysis output
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} locationZone
 * @returns {Promise<object>} Confirmation
 */
async function handleHazard(analysisResult, latitude, longitude, locationZone) {
  const db = admin.firestore();
  const alertId = uuidv4();
  const timestamp = new Date().toISOString();

  const alertRecord = {
    alertId,
    classification: "Biological Hazard",
    waste_type: analysisResult.waste_type,
    detected_items: analysisResult.detected_items || [],
    severity_score: analysisResult.severity_score,
    latitude,
    longitude,
    location_zone: locationZone,
    recommended_action: analysisResult.recommended_action,
    status: "Open",
    createdAt: timestamp,
  };

  // Persist to Firestore
  await db.collection("hazardAlerts").doc(alertId).set(alertRecord);

  // Console alert â€” visible in Firebase Functions logs / GCP Cloud Logging
  console.warn("HAZARD ALERT: Biological/Chemical waste detected", {
    alertId,
    latitude,
    longitude,
    locationZone,
    wasteType: analysisResult.waste_type,
    severity: analysisResult.severity_score,
    items: analysisResult.detected_items,
  });

  return {
    hazard_detected: true,
    alert_id: alertId,
    classification: "Biological Hazard",
    message:
      "Hazard classified and logged. Emergency alert saved to Firestore. " +
      "Check Cloud Functions logs for details.",
    recommended_action: analysisResult.recommended_action,
    createdAt: timestamp,
  };
}

module.exports = { isHazardous, handleHazard };
