"use strict";

const functions = require("firebase-functions");
const {
  findNearestDisposalUnit,
  saveHazardEscalation,
} = require("./firestoreService");
const { generateHazardNotification } = require("./geminiService");
const { dispatchHazardAlert } = require("./notificationService");

/**
 * AGENTIC WORKFLOW: Biological/Chemical Hazard Response
 *
 * Triggered automatically when analyzeWasteImage detects:
 * - Dead animal
 * - Biomedical waste
 * - Hazardous/chemical waste
 *
 * Pipeline:
 * 1. Classify hazard type
 * 2. Query Firestore for nearest specialized disposal unit
 * 3. Generate bilingual Tamil/English notification via Gemini
 * 4. Send SMS + email to zonal officer
 * 5. Save escalation record to Firestore
 * 6. Return agent response to caller
 *
 * @param {string} complaintId - The complaint ID that triggered this workflow
 * @param {object} analysisResult - Output from geminiService.analyzeWasteImage()
 * @param {object} location - { latitude, longitude, zone }
 * @returns {Promise<object>} Agent execution result
 */
async function runHazardResponseAgent(complaintId, analysisResult, location) {
  console.info("Hazard Response Agent triggered", {
    complaintId,
    hazardFlags: analysisResult.hazard_flags,
    zone: location.zone,
  });

  const agentLog = [];

  // â”€â”€ STEP 1: Classify hazard type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hazardType = classifyHazardType(analysisResult);
  agentLog.push({
    step: 1,
    action: "classify_hazard",
    result: hazardType,
    status: "completed",
  });

  console.info("Agent Step 1: Hazard classified", { hazardType });

  // â”€â”€ STEP 2: Find nearest specialized disposal unit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let disposalUnit = null;
  try {
    disposalUnit = await findNearestDisposalUnit(
      location.latitude,
      location.longitude,
      hazardType
    );
    agentLog.push({
      step: 2,
      action: "find_disposal_unit",
      result: disposalUnit
        ? { name: disposalUnit.name, distanceMeters: disposalUnit.distanceMeters }
        : "No unit found",
      status: disposalUnit ? "completed" : "warning",
    });
  } catch (err) {
    console.error("Agent Step 2: Failed to find disposal unit", {
      error: err.message,
    });
    agentLog.push({ step: 2, action: "find_disposal_unit", status: "failed", error: err.message });
    disposalUnit = getDefaultDisposalUnit(hazardType);
  }

  console.info("Agent Step 2: Disposal unit located", {
    unit: disposalUnit?.name,
  });

  // â”€â”€ STEP 3: Generate bilingual notification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let notification;
  try {
    notification = await generateHazardNotification(
      analysisResult,
      location,
      disposalUnit || getDefaultDisposalUnit(hazardType)
    );
    agentLog.push({
      step: 3,
      action: "generate_notification",
      result: { subject: notification.email_subject },
      status: "completed",
    });
  } catch (err) {
    console.error("Agent Step 3: Notification generation failed", {
      error: err.message,
    });
    notification = buildFallbackNotification(hazardType, complaintId, location);
    agentLog.push({
      step: 3,
      action: "generate_notification",
      status: "fallback_used",
    });
  }

  console.info("Agent Step 3: Notification generated");

  // â”€â”€ STEP 4: Dispatch SMS + Email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const escalationId = `ESC-${complaintId}-${Date.now()}`;
  let dispatchResult = { smsSent: false, emailSent: false };

  try {
    dispatchResult = await dispatchHazardAlert(notification, complaintId, escalationId);
    agentLog.push({
      step: 4,
      action: "dispatch_notifications",
      result: dispatchResult,
      status: "completed",
    });
  } catch (err) {
    console.error("Agent Step 4: Dispatch failed", { error: err.message });
    agentLog.push({ step: 4, action: "dispatch_notifications", status: "failed", error: err.message });
  }

  console.info("Agent Step 4: Notifications dispatched", dispatchResult);

  // â”€â”€ STEP 5: Save escalation record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    await saveHazardEscalation(complaintId, {
      hazardType,
      analysisResult,
      location,
      disposalUnit: disposalUnit
        ? { name: disposalUnit.name, distanceMeters: disposalUnit.distanceMeters }
        : null,
      notification: {
        smsTamil: notification.sms_tamil,
        smsEnglish: notification.sms_english,
        emailSubject: notification.email_subject,
      },
      dispatchResult,
      agentLog,
    });
    agentLog.push({ step: 5, action: "save_escalation", status: "completed" });
  } catch (err) {
    console.error("Agent Step 5: Failed to save escalation", { error: err.message });
    agentLog.push({ step: 5, action: "save_escalation", status: "failed", error: err.message });
  }

  console.info("Hazard Response Agent completed", { complaintId, escalationId });

  // â”€â”€ RETURN AGENT RESULT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return {
    agentTriggered: true,
    hazardClassification: "Biological Hazard",
    hazardType,
    escalationId,
    disposalUnit: disposalUnit
      ? {
          name: disposalUnit.name,
          phone: disposalUnit.contactPhone || null,
          distanceMeters: disposalUnit.distanceMeters,
        }
      : null,
    notificationsSent: {
      sms: dispatchResult.smsSent,
      email: dispatchResult.emailSent,
      recipient: "Zonal Officer",
    },
    confirmationMessage:
      "Biological hazard detected and escalated. Zonal officer has been notified via SMS and email. " +
      `Nearest disposal unit: ${disposalUnit?.name || "Emergency Response Team"}.`,
    agentSteps: agentLog,
  };
}

/**
 * Determines the specific hazard type from analysis flags.
 *
 * @param {object} analysisResult
 * @returns {string} Hazard type for disposal unit lookup
 */
function classifyHazardType(analysisResult) {
  const flags = analysisResult?.hazard_flags || {};

  if (flags.has_biomedical_waste) return "Biomedical Waste";
  if (flags.has_chemical_waste) return "Chemical/Hazardous Waste";
  if (flags.has_dead_animal) return "Dead Animal Removal";
  if (analysisResult?.waste_type === "Biological Hazard") return "Biological Hazard";

  return "General Hazardous Waste";
}

/**
 * Returns a default disposal unit when Firestore has no matching records.
 * This ensures the agent always has a unit to dispatch.
 *
 * @param {string} hazardType
 * @returns {object}
 */
function getDefaultDisposalUnit(hazardType) {
  return {
    name: "Madurai Corporation Emergency Response Unit",
    contactPhone: "+914522530530",
    contactEmail: "emergency@madurai-municipal.gov.in",
    latitude: 9.9252,
    longitude: 78.1198,
    capabilities: ["Biomedical Waste", "Dead Animal Removal", "Chemical/Hazardous Waste"],
    isActive: true,
    distanceMeters: null,
  };
}

/**
 * Builds a fallback notification when Gemini fails.
 *
 * @param {string} hazardType
 * @param {string} complaintId
 * @param {object} location
 * @returns {object}
 */
function buildFallbackNotification(hazardType, complaintId, location) {
  return {
    sms_tamil: `à®…à®µà®šà®° à®Žà®šà¯à®šà®°à®¿à®•à¯à®•à¯ˆ: ${location.zone} à®‡à®²à¯ à®†à®ªà®¤à¯à®¤à®¾à®© à®•à®´à®¿à®µà¯ à®•à®£à¯à®Ÿà®±à®¿à®¯à®ªà¯à®ªà®Ÿà¯à®Ÿà®¤à¯. à®ªà¯à®•à®¾à®°à¯ ID: ${complaintId}`,
    sms_english: `EMERGENCY: Hazardous waste detected at ${location.zone}. Complaint ID: ${complaintId}. Immediate action required.`,
    email_subject: `[EMERGENCY] Hazardous Waste Alert - ${hazardType} - ${complaintId}`,
    email_body_tamil: `à®®à®¾à®£à¯à®ªà¯à®®à®¿à®•à¯ à®®à®£à¯à®Ÿà®² à®…à®¤à®¿à®•à®¾à®°à®¿ à®…à®µà®°à¯à®•à®³à¯à®•à¯à®•à¯,\n\n${location.zone} à®‡à®²à¯ ${hazardType} à®•à®£à¯à®Ÿà®±à®¿à®¯à®ªà¯à®ªà®Ÿà¯à®Ÿà¯à®³à¯à®³à®¤à¯.\nà®ªà¯à®•à®¾à®°à¯ à®Žà®£à¯: ${complaintId}\n\nà®®à®¤à¯à®°à¯ˆ à®®à®¾à®¨à®•à®° à®®à®¾à®ªà¯à®ªà®¾à®³à¯ˆ`,
    email_body_english: `Dear Zonal Officer,\n\nHazardous waste (${hazardType}) has been detected at ${location.zone}.\nComplaint ID: ${complaintId}\nImmediate specialized disposal is required.\n\nMadurai Municipal Corporation\nCivic Intelligence System`,
    priority: "EMERGENCY",
    escalation_required: true,
  };
}

module.exports = {
  runHazardResponseAgent,
};
