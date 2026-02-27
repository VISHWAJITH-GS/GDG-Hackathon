// =============================================================================
// functions/index.js
// Firebase Cloud Function: analyzeWaste
//
// Flow:
//  1. Receive { imageUrl, metadata } from HTTP request body.
//  2. Send imageUrl to Google Cloud Vision API → label detection.
//  3. Compose a structured prompt with Vision labels + metadata and send to
//     Google Gemini API for waste analysis.
//  4. Validate and parse the returned JSON.
//  5. Persist the structured result into the Firestore `reports` collection.
//
// Environment variables (set via Firebase config or .env.local):
//   GEMINI_API_KEY          – Your Google Gemini API key
//   GOOGLE_CLOUD_PROJECT    – Firebase / GCP project ID (usually auto-set)
//
// Firestore collection written to: reports/{reportId}
// =============================================================================

"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const vision = require("@google-cloud/vision");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ---------------------------------------------------------------------------
// Initialise Firebase Admin SDK (idempotent – safe for hot-reloads)
// ---------------------------------------------------------------------------
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

// Google Cloud Vision – uses ADC (Application Default Credentials) in Cloud
// Functions automatically.  In local dev, point GOOGLE_APPLICATION_CREDENTIALS
// to a service-account JSON.
const visionClient = new vision.ImageAnnotatorClient();

// Gemini client
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calls Google Vision API label detection on the given public image URL.
 * Returns an array of label description strings sorted by score descending.
 *
 * @param {string} imageUrl – Publicly accessible image URL.
 * @returns {Promise<string[]>} Array of label description strings.
 */
async function detectLabels(imageUrl) {
  const [result] = await visionClient.labelDetection({ image: { source: { imageUri: imageUrl } } });
  const labels = result.labelAnnotations ?? [];
  // Sort by score descending, keep top 15 to stay below token limits
  return labels
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 15)
    .map((l) => `${l.description} (confidence: ${(l.score * 100).toFixed(1)}%)`);
}

/**
 * Composes the Gemini prompt with Vision labels and caller-supplied metadata.
 *
 * @param {string[]} labels        – Vision label strings.
 * @param {Record<string, any>} metadata – Arbitrary metadata from request.
 * @returns {string} Prompt string.
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
  "waste_type": "<string describing the primary type of waste, e.g. mixed solid waste, organic waste, construction debris>",
  "severity_score": <integer 1-10, where 1 is minimal and 10 is critical>,
  "dumping_pattern": "<string describing how the waste was dumped, e.g. scattered, heaped, roadside pile>",
  "area_type_guess": "<string describing the probable area, e.g. residential street, market, vacant lot>",
  "urgency_level": "<one of: low | medium | high | critical>",
  "confidence": <float 0.0-1.0 representing your confidence in this analysis>
}`;
}

/**
 * Calls Gemini and returns a validated analysis object.
 *
 * @param {string} prompt – The prompt to send.
 * @returns {Promise<Object>} Parsed and validated analysis object.
 */
async function analyzeWithGemini(prompt) {
  const result = await geminiModel.generateContent(prompt);
  const responseText = result.response.text().trim();

  // Strip any accidental markdown fences Gemini might still add
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseError) {
    throw new Error(
      `Gemini returned non-JSON response. Raw output: ${responseText}`
    );
  }

  // ── Schema validation ───────────────────────────────────────────────────
  const requiredFields = {
    waste_type: "string",
    severity_score: "number",
    dumping_pattern: "string",
    area_type_guess: "string",
    urgency_level: "string",
    confidence: "number",
  };

  const validUrgencyLevels = new Set(["low", "medium", "high", "critical"]);

  for (const [field, expectedType] of Object.entries(requiredFields)) {
    if (!(field in parsed)) {
      throw new Error(`Gemini response missing required field: "${field}"`);
    }
    // eslint-disable-next-line valid-typeof
    if (typeof parsed[field] !== expectedType) {
      throw new Error(
        `Field "${field}" expected type ${expectedType}, got ${typeof parsed[field]}`
      );
    }
  }

  if (!validUrgencyLevels.has(parsed.urgency_level)) {
    throw new Error(
      `Invalid urgency_level "${parsed.urgency_level}". Must be one of: ${[...validUrgencyLevels].join(", ")}`
    );
  }

  if (parsed.severity_score < 1 || parsed.severity_score > 10) {
    throw new Error(
      `severity_score ${parsed.severity_score} is out of range [1, 10]`
    );
  }

  if (parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error(
      `confidence ${parsed.confidence} is out of range [0.0, 1.0]`
    );
  }

  return parsed;
}

/**
 * Persists the analysis result alongside request metadata into Firestore.
 *
 * @param {string}              reportId  – Firestore document ID (caller-supplied or auto).
 * @param {string}              imageUrl  – Original image URL.
 * @param {Record<string,any>}  metadata  – Caller metadata.
 * @param {Object}              analysis  – Validated Gemini analysis object.
 * @param {string[]}            visionLabels – Raw Vision labels for audit trail.
 * @returns {Promise<string>}  The Firestore document ID used.
 */
async function saveToFirestore(reportId, imageUrl, metadata, analysis, visionLabels) {
  const reportsCol = db.collection("reports");
  const docRef = reportId ? reportsCol.doc(reportId) : reportsCol.doc();

  const payload = {
    // ── Core analysis result ─────────────────────────────────────────────
    ...analysis,

    // ── Source data ──────────────────────────────────────────────────────
    image_url: imageUrl,
    vision_labels: visionLabels,
    metadata: metadata,

    // ── Audit fields ─────────────────────────────────────────────────────
    analyzed_at: Timestamp.now(),
    status: "analyzed",
  };

  await docRef.set(payload, { merge: true });
  return docRef.id;
}

// ---------------------------------------------------------------------------
// Cloud Function: analyzeWaste
// ---------------------------------------------------------------------------

/**
 * HTTP Cloud Function - POST /analyzeWaste
 *
 * Request body (JSON):
 * {
 *   "imageUrl":  "https://...",        // required – public URL of waste image
 *   "reportId":  "abc123",             // optional – Firestore doc ID to update
 *   "metadata":  { ... }              // optional – arbitrary key-value pairs
 * }
 *
 * Successful response (200):
 * {
 *   "success": true,
 *   "reportId": "abc123",
 *   "analysis": { waste_type, severity_score, dumping_pattern,
 *                 area_type_guess, urgency_level, confidence }
 * }
 *
 * Error response (4xx / 5xx):
 * { "success": false, "error": "<message>" }
 */
exports.analyzeWaste = onRequest(
  {
    // Increase timeout for Vision + Gemini round-trips (max 540 s in Gen2)
    timeoutSeconds: 120,
    memory: "512MiB",
    // CORS – update origin to your actual frontends in production
    cors: true,
  },
  async (req, res) => {
    // ── Method guard ────────────────────────────────────────────────────
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
    }

    const { imageUrl, reportId = null, metadata = {} } = req.body ?? {};

    // ── Input validation ────────────────────────────────────────────────
    if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
      return res.status(400).json({
        success: false,
        error: "Request body must include a valid `imageUrl` (public HTTP/HTTPS URL).",
      });
    }

    try {
      // ── Step 1: Vision API label detection ──────────────────────────
      console.info(`[analyzeWaste] Running Vision label detection on: ${imageUrl}`);
      const visionLabels = await detectLabels(imageUrl);
      console.info(`[analyzeWaste] Vision detected ${visionLabels.length} labels.`);

      // ── Step 2: Build prompt ─────────────────────────────────────────
      const prompt = buildGeminiPrompt(visionLabels, metadata);

      // ── Step 3: Gemini analysis ──────────────────────────────────────
      console.info("[analyzeWaste] Sending prompt to Gemini...");
      const analysis = await analyzeWithGemini(prompt);
      console.info("[analyzeWaste] Gemini analysis complete:", analysis);

      // ── Step 4: Persist to Firestore ─────────────────────────────────
      const savedId = await saveToFirestore(
        reportId,
        imageUrl,
        metadata,
        analysis,
        visionLabels
      );
      console.info(`[analyzeWaste] Report saved to Firestore as: reports/${savedId}`);

      // ── Step 5: Respond ──────────────────────────────────────────────
      return res.status(200).json({
        success: true,
        reportId: savedId,
        analysis,
      });
    } catch (error) {
      console.error("[analyzeWaste] Error during processing:", error);

      // Distinguish client-caused errors from server faults
      const isClientError =
        error.message?.includes("missing required field") ||
        error.message?.includes("out of range") ||
        error.message?.includes("Invalid urgency_level");

      return res.status(isClientError ? 422 : 500).json({
        success: false,
        error: error.message || "Internal server error during waste analysis.",
      });
    }
  }
);
