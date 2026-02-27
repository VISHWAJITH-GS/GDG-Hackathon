"use strict";

require("dotenv").config();

const functions  = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const logger     = require("firebase-functions/logger");
const admin      = require("firebase-admin");
const express    = require("express");
const cors       = require("cors");
const speech     = require("@google-cloud/speech");
const { v4: uuidv4 } = require("uuid");

// â”€â”€ Firebase Admin (uses Application Default Credentials in Cloud Functions) â”€â”€
admin.initializeApp();
const db = admin.firestore();

// â”€â”€ Services â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const { analyzeWasteImage, classifyAudioComplaint } = require("./services/aiService");
const { verifyCleanup }   = require("./services/verificationService");
const { getPredictedRisk } = require("./services/predictionService");
const { isHazardous, handleHazard } = require("./services/hazardService");

// â”€â”€ Utils â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const { analyzeProximity, computePriorityScore } = require("./utils/distance");

// â”€â”€ Express App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "20mb" })); // base64 images can be large

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Middleware helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Wraps async route handlers to forward errors to the error middleware. */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Validates that required fields exist in req.body. */
function requireFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => req.body[f] === undefined || req.body[f] === "");
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(", ")}`,
      });
    }
    next();
  };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /health
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Clean Madurai AI",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /analyze-image
//
// Accepts a waste photo with GPS coordinates.
// 1. Computes proximity to Meenakshi Temple / Vaigai River using geolib
// 2. Passes image + zone context to Gemini 1.5 Flash
// 3. Saves complaint to Firestore
// 4. If hazard detected â†’ triggers hazardService pipeline
//
// Body: { imageBase64: string, latitude: number, longitude: number }
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post(
  "/analyze-image",
  requireFields(["imageBase64", "latitude", "longitude"]),
  asyncHandler(async (req, res) => {
    const { imageBase64, latitude, longitude } = req.body;

    // Step 1 â€” Compute zone and priority using geolib (free, no API key)
    const proximity       = analyzeProximity(latitude, longitude);
    const locationZone    = proximity.locationZone;

    // Step 2 â€” AI analysis (priority_score injected into the prompt)
    // We use a placeholder severity of 5 to calculate initial priority,
    // then recalculate after the AI returns its severity_score.
    const analysis = await analyzeWasteImage(
      imageBase64,
      locationZone,
      0 // placeholder â€” overridden below
    );

    // Step 3 â€” Override with server-authoritative priority score
    analysis.priority_score = computePriorityScore(
      analysis.severity_score,
      proximity.nearestSite.distanceMeters
    );
    analysis.location_zone = locationZone; // Ensure server value wins

    // Step 4 â€” Persist complaint to Firestore
    const complaintId = uuidv4();
    const complaintDoc = {
      complaintId,
      source: "image",
      latitude,
      longitude,
      waste_type:     analysis.waste_type,
      severity_score: analysis.severity_score,
      priority_score: analysis.priority_score,
      location_zone:  analysis.location_zone,
      detected_items: analysis.detected_items,
      recommended_action: analysis.recommended_action,
      confidence:     analysis.confidence,
      status:         "Open",
      createdAt:      new Date().toISOString(),
    };

    await db.collection("complaints").doc(complaintId).set(complaintDoc);
    logger.info("/analyze-image: saved complaint", { complaintId, locationZone });

    // Step 5 â€” Hazard detection (agentic pipeline)
    let hazardResponse = null;
    if (isHazardous(analysis)) {
      hazardResponse = await handleHazard(analysis, latitude, longitude, locationZone);
      await db.collection("complaints").doc(complaintId).update({
        status: "Escalated",
        hazardAlertId: hazardResponse.alert_id,
      });
    }

    res.status(200).json({
      success:     true,
      complaintId,
      analysis,
      proximity: {
        nearestLandmark:  proximity.nearestSite.name,
        distanceMeters:   proximity.nearestSite.distanceMeters,
        isRedZone:        proximity.isRedZone,
      },
      hazardResponse,
    });
  })
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /verify-cleanup
//
// Proof of Work: compares before/after images using Gemini 1.5 Pro.
// Detects fraud (different location, hidden trash, cropping).
//
// Body: { beforeImageBase64: string, afterImageBase64: string }
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post(
  "/verify-cleanup",
  requireFields(["beforeImageBase64", "afterImageBase64"]),
  asyncHandler(async (req, res) => {
    const { beforeImageBase64, afterImageBase64 } = req.body;

    const result = await verifyCleanup(beforeImageBase64, afterImageBase64);

    logger.info("/verify-cleanup result", {
      status: result.verification_status,
      fraudProbability: result.fraud_probability,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  })
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /analyze-audio
//
// 1. Transcribes Tamil speech using Google Speech-to-Text (ta-IN)
// 2. Classifies the complaint using Gemini 1.5 Flash
//
// Body: { audioBase64: string, encoding?: string, sampleRateHertz?: number }
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post(
  "/analyze-audio",
  requireFields(["audioBase64"]),
  asyncHandler(async (req, res) => {
    const {
      audioBase64,
      encoding        = "LINEAR16",
      sampleRateHertz = 16000,
    } = req.body;

    // Step 1 â€” Transcribe with Google Speech-to-Text (Tamil â€” India)
    const speechClient = new speech.SpeechClient();

    const [sttResponse] = await speechClient.recognize({
      audio: { content: audioBase64 },
      config: {
        encoding,
        sampleRateHertz,
        languageCode: "ta-IN",
        alternativeLanguageCodes: ["en-IN"],
        model: "latest_long",
        enableAutomaticPunctuation: true,
        useEnhanced: true,
        speechContexts: [
          {
            phrases: [
              "à®•à¯à®ªà¯à®ªà¯ˆ", "à®¨à®¾à®±à¯à®¤à¯", "à®µà®¾à®´à¯ˆ à®‡à®²à¯ˆ", "à®ªà¯‚ à®®à®¾à®²à¯ˆ",
              "à®•à®´à®¿à®µà®Ÿà¯ˆ", "à®¤à®£à¯à®£à¯€à®°à¯", "à®¨à®¾à®¯à¯",
              "kuppai", "naaruthu", "vazhai illai",
            ],
            boost: 15,
          },
        ],
      },
    });

    const transcript = sttResponse.results
      ?.map((r) => r.alternatives?.[0]?.transcript || "")
      .join(" ")
      .trim();

    if (!transcript) {
      return res.status(422).json({
        success: false,
        error: "Could not transcribe audio. Ensure it is clear Tamil speech in LINEAR16 or FLAC format.",
      });
    }

    // Step 2 â€” Classify with Gemini 1.5 Flash
    const classification = await classifyAudioComplaint(transcript);

    logger.info("/analyze-audio: classified", {
      transcript,
      category: classification.category,
    });

    res.status(200).json({
      success: true,
      transcription: { text: transcript, language: "ta-IN" },
      ...classification,
    });
  })
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /predict-risk?ward=12
//
// Fetches last 90 days of Firestore complaints for the given ward,
// then uses Gemini 1.5 Flash to predict a risk score (0.0â€“1.0).
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get(
  "/predict-risk",
  asyncHandler(async (req, res) => {
    const wardParam = req.query.ward;

    if (!wardParam) {
      return res.status(400).json({
        success: false,
        error: "Query parameter 'ward' is required. Example: /predict-risk?ward=12",
      });
    }

    const ward = parseInt(wardParam, 10);
    if (isNaN(ward) || ward < 1 || ward > 200) {
      return res.status(400).json({
        success: false,
        error: "Ward must be an integer between 1 and 200.",
      });
    }

    const prediction = await getPredictedRisk(ward);

    logger.info("/predict-risk result", {
      ward,
      riskScore: prediction.risk_score,
    });

    res.status(200).json({
      success: true,
      ...prediction,
    });
  })
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 404 â€” unknown routes
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Global error handler â€” catches all async errors
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error("Unhandled error", {
    path:    req.path,
    method:  req.method,
    message: err.message,
    stack:   err.stack,
  });

  const status = err.status || err.statusCode || 500;

  res.status(status).json({
    success: false,
    error:   err.message || "Internal server error",
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Export as Firebase Cloud Function
// Region: us-central1 | Memory: 1GiB | Timeout: 540s (Gemini can be slow)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.api = onRequest(
  { region: "us-central1", memory: "1GiB", timeoutSeconds: 540, cors: true },
  app
);
