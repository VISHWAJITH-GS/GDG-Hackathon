"use strict";

const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { predictRiskFromHistory } = require("./aiService");

/**
 * Fetches the most recent Firestore complaints (last 90 days),
 * then uses Gemini 1.5 Flash to reason over them and predict risk for the ward.
 *
 * Note: analyze-image does not accept a ward field in its input, so complaints
 * are not ward-tagged. We query all recent complaints and pass the ward number
 * to Gemini for context-aware reasoning.
 *
 * @param {number} ward - Ward number requested by the caller
 * @returns {Promise<object>} Risk prediction result
 */
async function getPredictedRisk(ward) {
  const db = admin.firestore();

  // Fetch latest 100 complaints ordered by time â€” no ward filter needed
  // because analyze-image does not store a ward field.
  const snapshot = await db
    .collection("complaints")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  // Filter in-memory to last 90 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString();

  const history = snapshot.docs
    .map((doc) => {
      const d = doc.data();
      return {
        createdAt:      d.createdAt,
        waste_type:     d.waste_type,
        severity_score: d.severity_score,
        location_zone:  d.location_zone,
      };
    })
    .filter((c) => c.createdAt >= cutoffStr);

  console.info("Prediction: fetched history", {
    ward,
    count: history.length,
  });

  if (history.length === 0) {
    return {
      ward,
      risk_score: 0.1,
      reason: "No complaint history found in the past 90 days. Baseline risk assigned.",
      trend: "Stable",
      festival_alert: null,
    };
  }

  return await predictRiskFromHistory(ward, history);
}

module.exports = { getPredictedRisk };
