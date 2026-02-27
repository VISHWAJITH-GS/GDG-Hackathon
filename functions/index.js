// =============================================================================
// functions/index.js
// Firebase Cloud Functions — M-Clean | Madurai Municipal Corporation
//
// Exported functions:
//   1. analyzeWaste        - HTTP POST: Vision → Gemini → Firestore pipeline
//   2. calculateWardScore  - HTTP POST: Compute ward cleanliness score
//
// Environment variables (set in functions/.env or Firebase Secrets):
//   GEMINI_API_KEY   – Your Google Gemini API key
//
// Firestore collection: reports/{reportId}
// =============================================================================

"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const vision = require("@google-cloud/vision");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ---------------------------------------------------------------------------
// Global options — deploy to asia-south1 (closest region to Madurai)
// ---------------------------------------------------------------------------
setGlobalOptions({ region: "asia-south1" });

// ---------------------------------------------------------------------------
// Firebase Admin — idempotent init (safe for hot-reloads & emulators)
// ---------------------------------------------------------------------------
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------
// For local dev: create functions/.env with:
//   GEMINI_API_KEY=your_key_here
// For production: firebase functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const REPORTS_COL = process.env.FIRESTORE_COLLECTION || "reports";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

// Vision — uses Application Default Credentials automatically in Cloud Functions.
// For local dev: set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
const visionClient = new vision.ImageAnnotatorClient();

// Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });

// =============================================================================
// SECTION 1 — analyzeWaste helpers
// =============================================================================

/**
 * Calls Vision API label detection on a public image URL.
 * Returns top-15 labels sorted by confidence descending.
 *
 * @param {string} imageUrl
 * @returns {Promise<string[]>}
 */
async function detectLabels(imageUrl) {
  const [result] = await visionClient.labelDetection({
    image: { source: { imageUri: imageUrl } },
  });

  const labels = result.labelAnnotations ?? [];

  if (labels.length === 0) {
    throw new Error("Vision API returned no labels for the provided image.");
  }

  return labels
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 15)
    .map((l) => `${l.description} (confidence: ${((l.score ?? 0) * 100).toFixed(1)}%)`);
}

/**
 * Builds the Gemini prompt with Vision labels and caller metadata.
 *
 * @param {string[]}            labels
 * @param {Record<string, any>} metadata
 * @returns {string}
 */
function buildGeminiPrompt(labels, metadata) {
  const labelText = labels.length ? labels.join(", ") : "No labels detected";
  const metaText = Object.keys(metadata).length
    ? JSON.stringify(metadata, null, 2)
    : "No additional metadata provided";

  return `You are an AI sanitation analyst for Madurai Municipal Corporation.
Analyze the following waste image data and return STRICTLY valid JSON (no markdown, no code fences, no extra text):

Vision API detected labels: ${labelText}

Additional metadata:
${metaText}

Return exactly this JSON structure:
{
  "waste_type": "<string — e.g. Household Garbage, Construction Debris, Biomedical Waste>",
  "severity_score": <integer 1–10, where 1 is minimal and 10 is critical>,
  "dumping_pattern": "<string — e.g. One-time dump, Repeated illegal dumping, Scattered>",
  "area_type_guess": "<string — e.g. Residential street, Market area, Roadside, Open plot>",
  "urgency_level": "<one of: low | medium | high | critical>",
  "confidence": <float 0.0–1.0 representing your confidence in this analysis>
}`;
}

/**
 * Sends a prompt to Gemini and returns a validated waste-analysis object.
 *
 * @param {string} prompt
 * @returns {Promise<Object>}
 */
async function callGeminiAndValidate(prompt) {
  const result = await geminiModel.generateContent(prompt);
  const responseText = result.response.text().trim();

  // Strip accidental markdown fences
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned non-JSON output. Raw: ${responseText}`);
  }

  // ── Field & type validation ──────────────────────────────────────────────
  const requiredFields = {
    waste_type: "string",
    severity_score: "number",
    dumping_pattern: "string",
    area_type_guess: "string",
    urgency_level: "string",
    confidence: "number",
  };

  for (const [field, expectedType] of Object.entries(requiredFields)) {
    if (!(field in parsed)) {
      throw new Error(`Gemini response missing required field: "${field}"`);
    }
    // eslint-disable-next-line valid-typeof
    if (typeof parsed[field] !== expectedType) {
      throw new Error(`Field "${field}" expected ${expectedType}, got ${typeof parsed[field]}`);
    }
  }

  const validUrgency = new Set(["low", "medium", "high", "critical"]);
  if (!validUrgency.has(parsed.urgency_level)) {
    throw new Error(
      `Invalid urgency_level "${parsed.urgency_level}". Must be one of: ${[...validUrgency].join(", ")}`
    );
  }
  if (parsed.severity_score < 1 || parsed.severity_score > 10) {
    throw new Error(`severity_score ${parsed.severity_score} out of range [1, 10]`);
  }
  if (parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error(`confidence ${parsed.confidence} out of range [0.0, 1.0]`);
  }

  return {
    waste_type: String(parsed.waste_type),
    severity_score: Number(parsed.severity_score),
    dumping_pattern: String(parsed.dumping_pattern),
    area_type_guess: String(parsed.area_type_guess),
    urgency_level: String(parsed.urgency_level),
    confidence: Number(parsed.confidence),
  };
}

/**
 * Persists the AI analysis alongside source data into Firestore.
 * Uses `merge: true` so pre-existing reporter fields are never overwritten.
 *
 * @param {string|null}         reportId
 * @param {string}              imageUrl
 * @param {Record<string,any>}  metadata
 * @param {Object}              analysis
 * @param {string[]}            visionLabels
 * @returns {Promise<string>}   Firestore document ID
 */
async function persistAnalysis(reportId, imageUrl, metadata, analysis, visionLabels) {
  const col = db.collection(REPORTS_COL);
  const docRef = reportId ? col.doc(reportId) : col.doc();

  await docRef.set(
    {
      ai_analysis: {
        ...analysis,
        vision_labels: visionLabels,
        analyzed_at: FieldValue.serverTimestamp(),
      },
      image_url: imageUrl,
      status: analysis.urgency_level === "critical" ? "flagged" : "analyzed",
      metadata: {
        ...metadata,
        processed_at: FieldValue.serverTimestamp(),
      },
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return docRef.id;
}

// =============================================================================
// SECTION 2 — calculateWardScore helpers
// =============================================================================

/**
 * Rating bands for ward cleanliness scores.
 * Evaluated top-down; first matching band wins.
 */
const RATING_BANDS = [
  { min: 80, max: 100, category: "Clean" },
  { min: 50, max: 79, category: "Moderate" },
  { min: 0, max: 49, category: "Critical" },
];

/**
 * Derives a rating category string from a numeric ward score.
 *
 * @param {number} score  Clamped score in [0, 100].
 * @returns {string}      "Clean" | "Moderate" | "Critical"
 */
function getRatingCategory(score) {
  for (const band of RATING_BANDS) {
    if (score >= band.min && score <= band.max) {
      return band.category;
    }
  }
  return "Critical"; // safety fallback
}

/**
 * Core scoring algorithm — exported as a plain function so it can be unit-tested
 * independently from the HTTP layer.
 *
 * Formula:
 *   raw_score = 100 - (total_reports × 2) - (high_severity_reports × 3)
 *   ward_cleanliness_score = clamp(raw_score, 0, 100)
 *
 * @param {number} total_reports         Total reports filed for the ward.
 * @param {number} high_severity_reports Reports with severity_score ≥ 7 (or urgency high/critical).
 * @returns {{ ward_cleanliness_score: number, rating_category: string }}
 */
function calculateWardScore({ total_reports, high_severity_reports }) {
  // ── Input coercion & sanity checks ──────────────────────────────────────
  const total = Math.max(0, Math.floor(Number(total_reports) || 0));
  const severe = Math.max(0, Math.floor(Number(high_severity_reports) || 0));

  if (severe > total) {
    throw new Error(
      `high_severity_reports (${severe}) cannot exceed total_reports (${total})`
    );
  }

  // ── Formula ─────────────────────────────────────────────────────────────
  const raw = 100 - (total * 2) - (severe * 3);
  const score = Math.min(100, Math.max(0, raw));  // clamp to [0, 100]

  return {
    ward_cleanliness_score: score,
    rating_category: getRatingCategory(score),
  };
}

// =============================================================================
// CLOUD FUNCTION 1 — analyzeWaste
// =============================================================================

/**
 * POST /analyzeWaste
 *
 * Request body:
 * {
 *   "imageUrl":  "https://...",    // required — public image URL
 *   "reportId":  "docId",         // optional — Firestore doc to update
 *   "metadata":  { … }            // optional — lat, lng, notes, etc.
 * }
 *
 * Success 200:
 * { success: true, reportId, analysis, vision_labels }
 *
 * Error 4xx/5xx:
 * { success: false, error: "…" }
 */
exports.analyzeWaste = onRequest(
  { timeoutSeconds: 120, memory: "512MiB", cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
    }

    const { imageUrl, reportId = null, metadata = {} } = req.body ?? {};

    if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
      return res.status(400).json({
        success: false,
        error: "Request body must include a valid `imageUrl` (public HTTP/HTTPS URL).",
      });
    }

    console.info(`[analyzeWaste] START — reportId: ${reportId} | image: ${imageUrl}`);

    try {
      // Step 1 — Vision
      console.info("[analyzeWaste] Step 1: Vision label detection...");
      const visionLabels = await detectLabels(imageUrl);
      console.info(`[analyzeWaste] Labels: ${visionLabels.join(", ")}`);

      // Step 2 — Build prompt
      const prompt = buildGeminiPrompt(visionLabels, metadata);

      // Step 3 — Gemini
      console.info("[analyzeWaste] Step 2: Gemini analysis...");
      const analysis = await callGeminiAndValidate(prompt);
      console.info("[analyzeWaste] Analysis:", JSON.stringify(analysis));

      // Step 4 — Firestore
      console.info("[analyzeWaste] Step 3: Persisting to Firestore...");
      const savedId = await persistAnalysis(reportId, imageUrl, metadata, analysis, visionLabels);
      console.info(`[analyzeWaste] Saved → reports/${savedId}`);

      return res.status(200).json({
        success: true,
        reportId: savedId,
        analysis,
        vision_labels: visionLabels,
        message: "Waste analysis complete and saved to Firestore.",
      });
    } catch (error) {
      console.error("[analyzeWaste] ERROR:", error);

      const isClientError =
        error.message?.includes("missing required field") ||
        error.message?.includes("out of range") ||
        error.message?.includes("Invalid urgency_level") ||
        error.message?.includes("non-JSON");

      return res.status(isClientError ? 422 : 500).json({
        success: false,
        error: error.message || "Internal server error during waste analysis.",
      });
    }
  }
);

// =============================================================================
// CLOUD FUNCTION 2 — calculateWardScore
// =============================================================================

/**
 * POST /calculateWardScore
 *
 * Computes a cleanliness score for a municipal ward based on report volumes.
 *
 * Formula:
 *   score = 100 − (total_reports × 2) − (high_severity_reports × 3)
 *   score is clamped to [0, 100]
 *
 * Request body:
 * {
 *   "ward_id":               "WARD-07",   // optional — echoed back in response
 *   "total_reports":         15,           // required — ≥ 0 integer
 *   "high_severity_reports": 4            // required — ≥ 0, ≤ total_reports
 * }
 *
 * Success 200:
 * {
 *   "success": true,
 *   "ward_id": "WARD-07",
 *   "total_reports": 15,
 *   "high_severity_reports": 4,
 *   "ward_cleanliness_score": 58,
 *   "rating_category": "Moderate"
 * }
 *
 * Rating bands:
 *   80 – 100 → "Clean"
 *   50 –  79 → "Moderate"
 *    0 –  49 → "Critical"
 *
 * Error responses:
 *   400 — missing / invalid inputs
 *   422 — business-rule violation (severe > total)
 *   500 — unexpected server error
 */
exports.calculateWardScore = onRequest(
  { timeoutSeconds: 30, memory: "256MiB", cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
    }

    const {
      ward_id = null,
      total_reports,
      high_severity_reports,
    } = req.body ?? {};

    // ── Input presence validation ──────────────────────────────────────────
    if (total_reports === undefined || total_reports === null) {
      return res.status(400).json({
        success: false,
        error: "`total_reports` is required in the request body.",
      });
    }
    if (high_severity_reports === undefined || high_severity_reports === null) {
      return res.status(400).json({
        success: false,
        error: "`high_severity_reports` is required in the request body.",
      });
    }

    // ── Numeric type validation ────────────────────────────────────────────
    if (isNaN(Number(total_reports)) || Number(total_reports) < 0) {
      return res.status(400).json({
        success: false,
        error: "`total_reports` must be a non-negative number.",
      });
    }
    if (isNaN(Number(high_severity_reports)) || Number(high_severity_reports) < 0) {
      return res.status(400).json({
        success: false,
        error: "`high_severity_reports` must be a non-negative number.",
      });
    }

    console.info(
      `[calculateWardScore] ward_id=${ward_id} total=${total_reports} high_severity=${high_severity_reports}`
    );

    try {
      const result = calculateWardScore({ total_reports, high_severity_reports });

      return res.status(200).json({
        success: true,
        ward_id,
        total_reports: Number(total_reports),
        high_severity_reports: Number(high_severity_reports),
        ...result,
      });
    } catch (error) {
      console.error("[calculateWardScore] ERROR:", error);

      const isBusinessRuleError = error.message?.includes("cannot exceed");

      return res.status(isBusinessRuleError ? 422 : 500).json({
        success: false,
        error: error.message || "Internal server error during score calculation.",
      });
    }
  }
);

// =============================================================================
// Named export for unit testing (calculateWardScore core logic)
// =============================================================================
exports._calculateWardScore = calculateWardScore;
