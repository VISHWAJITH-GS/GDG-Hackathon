// =============================================================================
// functions/index.js
// Firebase Cloud Functions — M-Clean | Madurai Municipal Corporation
//
// Exported functions:
//   1. analyzeWaste        - HTTP POST: Vision → Gemini → Firestore pipeline
//   2. calculateWardScore  - HTTP POST: Compute ward cleanliness score
//   3. detectHotspots      - HTTP POST: 7-day Firestore reports → Gemini hotspot analysis
//   4. predictGarbage      - HTTP POST: 7-day data + weather/festival → Gemini risk prediction
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

// =============================================================================
// SECTION 3 — detectHotspots helpers
// =============================================================================

/**
 * Timestamp for N days ago from now (UTC).
 * @param {number} days
 * @returns {Date}
 */
function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * Serialises a Firestore document snapshot to a plain JSON-safe object.
 * Converts Firestore Timestamps → ISO strings and drops undefined values.
 *
 * @param {FirebaseFirestore.QueryDocumentSnapshot} doc
 * @returns {Record<string, any>}
 */
function serializeReport(doc) {
  const data = doc.data();

  // Recursively turn Timestamp objects into ISO strings
  function normalize(value) {
    if (value && typeof value.toDate === "function") {
      return value.toDate().toISOString();
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, normalize(v)])
      );
    }
    return value;
  }

  return { id: doc.id, ...normalize(data) };
}

/**
 * Builds the Gemini prompt for hotspot detection.
 *
 * @param {Record<string, any>[]} reports  Serialised report objects.
 * @returns {string}
 */
function buildHotspotPrompt(reports) {
  // Keep the payload lean: send only the fields Gemini needs for spatial analysis
  const slim = reports.map((r) => ({
    id: r.id,
    latitude: r.metadata?.latitude ?? r.latitude ?? null,
    longitude: r.metadata?.longitude ?? r.longitude ?? null,
    waste_type: r.ai_analysis?.waste_type ?? r.waste_type ?? "unknown",
    severity: r.ai_analysis?.severity_score ?? r.severity_score ?? null,
    urgency: r.ai_analysis?.urgency_level ?? r.urgency_level ?? "unknown",
    dumping_pattern: r.ai_analysis?.dumping_pattern ?? r.dumping_pattern ?? null,
    area_type: r.ai_analysis?.area_type_guess ?? r.area_type_guess ?? null,
    timestamp: r.metadata?.processed_at ?? r.analyzed_at ?? null,
    status: r.status ?? "unknown",
  }));

  const reportJson = JSON.stringify(slim, null, 2);

  return `You are an urban sanitation data analyst for Madurai Municipal Corporation.
Analyze the following waste reports from the past 7 days and identify patterns.
Return ONLY strictly valid JSON with NO markdown, NO code fences, NO extra explanation.

Reports (${slim.length} total):
${reportJson}

Return exactly this JSON structure:
{
  "top_hotspots": [
    {
      "location_description": "<human-readable area name or coordinate summary>",
      "latitude": <number or null>,
      "longitude": <number or null>,
      "report_count": <integer>,
      "dominant_waste_type": "<string>",
      "avg_severity": <float 1.0–10.0>
    }
  ],
  "repeated_dumping_zones": [
    {
      "location_description": "<string>",
      "latitude": <number or null>,
      "longitude": <number or null>,
      "frequency": "<e.g. daily, every 2 days>",
      "waste_type": "<string>"
    }
  ],
  "peak_waste_time": "<e.g. Mornings 6–9 AM, Weekends, After market hours>",
  "pattern_explanation": "<2–4 sentence plain-English summary of the dominant patterns, hotspots, and recommended priority areas>"
}

Rules:
- top_hotspots must contain 1–3 entries (do not pad with fictional data if fewer real hotspots exist).
- repeated_dumping_zones must contain 0–3 entries.
- If location data (lat/lng) is missing for a zone, set latitude and longitude to null.
- Base all findings strictly on the provided report data — do not invent locations.`;
}

/**
 * Parses and validates the Gemini hotspot-analysis JSON response.
 *
 * @param {string} rawText  Raw text returned by Gemini.
 * @returns {Object}        Validated hotspot analysis object.
 */
function parseHotspotResponse(rawText) {
  // Strip any accidental markdown fences
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned non-JSON output. Raw: ${rawText}`);
  }

  // ── Required top-level key validation ───────────────────────────────────
  const requiredKeys = [
    "top_hotspots",
    "repeated_dumping_zones",
    "peak_waste_time",
    "pattern_explanation",
  ];

  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`Gemini response missing required field: "${key}"`);
    }
  }

  if (!Array.isArray(parsed.top_hotspots)) {
    throw new Error(`"top_hotspots" must be an array.`);
  }
  if (!Array.isArray(parsed.repeated_dumping_zones)) {
    throw new Error(`"repeated_dumping_zones" must be an array.`);
  }
  if (parsed.top_hotspots.length > 3) {
    // Trim silently rather than throwing — Gemini occasionally over-generates
    parsed.top_hotspots = parsed.top_hotspots.slice(0, 3);
  }
  if (parsed.repeated_dumping_zones.length > 3) {
    parsed.repeated_dumping_zones = parsed.repeated_dumping_zones.slice(0, 3);
  }
  if (typeof parsed.peak_waste_time !== "string" || !parsed.peak_waste_time.trim()) {
    throw new Error(`"peak_waste_time" must be a non-empty string.`);
  }
  if (typeof parsed.pattern_explanation !== "string" || !parsed.pattern_explanation.trim()) {
    throw new Error(`"pattern_explanation" must be a non-empty string.`);
  }

  return {
    top_hotspots: parsed.top_hotspots,
    repeated_dumping_zones: parsed.repeated_dumping_zones,
    peak_waste_time: parsed.peak_waste_time.trim(),
    pattern_explanation: parsed.pattern_explanation.trim(),
  };
}

// =============================================================================
// CLOUD FUNCTION 3 — detectHotspots
// =============================================================================

/**
 * POST /detectHotspots
 *
 * Fetches all waste reports from the past 7 days, sends them to Gemini
 * for spatial pattern analysis, validates the response, and returns it.
 *
 * Request body (all optional):
 * {
 *   "days":    7,          // lookback window in days (default: 7, max: 30)
 *   "ward_id": "WARD-07"  // optional — filter reports to a specific ward
 * }
 *
 * Success 200:
 * {
 *   "success": true,
 *   "report_count": 23,
 *   "lookback_days": 7,
 *   "generated_at": "2026-02-27T13:15:09.000Z",
 *   "top_hotspots": [ … ],
 *   "repeated_dumping_zones": [ … ],
 *   "peak_waste_time": "…",
 *   "pattern_explanation": "…"
 * }
 *
 * Error 4xx/5xx:
 * { "success": false, "error": "…" }
 */
exports.detectHotspots = onRequest(
  {
    timeoutSeconds: 120,   // Firestore fetch + Gemini can be slow on large datasets
    memory: "512MiB",
    cors: true,
  },
  async (req, res) => {
    // ── Method guard ──────────────────────────────────────────────────────
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({ success: false, error: "Use POST or GET." });
    }

    const body = req.method === "GET" ? req.query : (req.body ?? {});
    const rawDays = parseInt(body.days ?? "7", 10);
    const wardFilter = body.ward_id ?? null;

    const lookbackDays = (!isNaN(rawDays) && rawDays >= 1 && rawDays <= 30)
      ? rawDays
      : 7;

    const cutoff = Timestamp.fromDate(daysAgo(lookbackDays));

    console.info(
      `[detectHotspots] Fetching reports: last ${lookbackDays} day(s)${wardFilter ? ` | ward: ${wardFilter}` : ""
      }`
    );

    try {
      // ── Step 1: Fetch last N days of reports from Firestore ─────────────
      let query = db
        .collection(REPORTS_COL)
        .where("metadata.processed_at", ">=", cutoff)
        .orderBy("metadata.processed_at", "desc");

      if (wardFilter) {
        query = query.where("metadata.ward_id", "==", wardFilter);
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        // No data — return a graceful empty-state response
        console.info("[detectHotspots] No reports found in the lookback window.");
        return res.status(200).json({
          success: true,
          report_count: 0,
          lookback_days: lookbackDays,
          generated_at: new Date().toISOString(),
          top_hotspots: [],
          repeated_dumping_zones: [],
          peak_waste_time: "No data available",
          pattern_explanation: "No waste reports were found in the selected time window. As reports are filed, hotspot patterns will appear here.",
        });
      }

      // ── Step 2: Serialise to plain JSON array ────────────────────────────
      const reports = snapshot.docs.map(serializeReport);
      console.info(`[detectHotspots] ${reports.length} reports fetched.`);

      // ── Step 3: Build Gemini prompt ──────────────────────────────────────
      const prompt = buildHotspotPrompt(reports);

      // ── Step 4: Call Gemini with low temperature for deterministic output ─
      const hotspotModel = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
          temperature: 0.1,   // Low — factual / pattern-based output
          topP: 0.8,
          maxOutputTokens: 2048,
        },
      });

      console.info("[detectHotspots] Calling Gemini...");
      const geminiResult = await hotspotModel.generateContent(prompt);
      const rawText = geminiResult.response.text();
      console.info(`[detectHotspots] Gemini raw response length: ${rawText.length} chars`);

      // ── Step 5: Validate JSON ────────────────────────────────────────────
      const hotspotData = parseHotspotResponse(rawText);
      console.info(
        `[detectHotspots] Validated — ${hotspotData.top_hotspots.length} hotspot(s), ` +
        `${hotspotData.repeated_dumping_zones.length} dumping zone(s).`
      );

      // ── Step 6: Return to frontend ───────────────────────────────────────
      return res.status(200).json({
        success: true,
        report_count: reports.length,
        lookback_days: lookbackDays,
        generated_at: new Date().toISOString(),
        ...hotspotData,
      });
    } catch (error) {
      console.error("[detectHotspots] ERROR:", error);

      const isValidationError =
        error.message?.includes("missing required field") ||
        error.message?.includes("must be an array") ||
        error.message?.includes("must be a non-empty") ||
        error.message?.includes("non-JSON");

      return res.status(isValidationError ? 422 : 500).json({
        success: false,
        error: error.message || "Internal server error during hotspot detection.",
      });
    }
  }
);

// =============================================================================
// SECTION 4 — predictGarbage helpers
// =============================================================================

/**
 * Weather condition constants — used when no real weather API is connected.
 * Replace with a live weather API call (e.g. OpenWeatherMap) in production.
 */
const MOCK_WEATHER_CONDITIONS = [
  "Clear sky, 32°C",
  "Partly cloudy, 29°C",
  "Heavy rain expected, 25°C",
  "Hot and humid, 35°C",
  "Thunderstorm likely, 27°C",
];

/**
 * Returns a mock weather string.
 * If `weatherOverride` is supplied in the request it is used directly;
 * otherwise a value is chosen pseudo-randomly so demos feel realistic.
 *
 * @param {string|null} weatherOverride  Caller-supplied weather description.
 * @returns {string}
 */
function resolveMockWeather(weatherOverride) {
  if (weatherOverride && typeof weatherOverride === "string") {
    return weatherOverride.trim();
  }
  // Pseudo-random selection seeded on the current hour so the same
  // value is stable within a session but rotates hourly.
  const hourSeed = new Date().getUTCHours();
  return MOCK_WEATHER_CONDITIONS[hourSeed % MOCK_WEATHER_CONDITIONS.length];
}

/**
 * Well-known Madurai festival periods for mock festival detection.
 * A real implementation would query a calendar API.
 *
 * @typedef {{ name: string, month: number, dayStart: number, dayEnd: number }} FestivalWindow
 * @type {FestivalWindow[]}
 */
const FESTIVAL_CALENDAR = [
  { name: "Pongal", month: 1, dayStart: 14, dayEnd: 17 },
  { name: "Chithirai Festival", month: 4, dayStart: 18, dayEnd: 30 },
  { name: "Aadi Perukku", month: 8, dayStart: 3, dayEnd: 3 },
  { name: "Diwali", month: 10, dayStart: 28, dayEnd: 30 },
  { name: "Karthigai Deepam", month: 11, dayStart: 25, dayEnd: 27 },
];

/**
 * Determines whether tomorrow falls within a known festival window.
 *
 * @returns {{ isFestival: boolean, festivalName: string|null }}
 */
function detectUpcomingFestival() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const m = tomorrow.getMonth() + 1;  // 1-indexed
  const d = tomorrow.getDate();

  for (const fest of FESTIVAL_CALENDAR) {
    if (fest.month === m && d >= fest.dayStart && d <= fest.dayEnd) {
      return { isFestival: true, festivalName: fest.name };
    }
  }
  return { isFestival: false, festivalName: null };
}

/**
 * Builds the compact historical summary that gets embedded in the Gemini prompt.
 * Limits the payload to the 50 most recent reports to stay within token limits.
 *
 * @param {Record<string, any>[]} reports  Serialised Firestore report objects.
 * @returns {Record<string, any>[]}
 */
function buildHistoricalSummary(reports) {
  return reports
    .slice(0, 50)
    .map((r) => ({
      id: r.id,
      latitude: r.metadata?.latitude ?? r.latitude ?? null,
      longitude: r.metadata?.longitude ?? r.longitude ?? null,
      area_type: r.ai_analysis?.area_type_guess ?? r.area_type_guess ?? null,
      waste_type: r.ai_analysis?.waste_type ?? r.waste_type ?? "unknown",
      severity: r.ai_analysis?.severity_score ?? r.severity_score ?? null,
      urgency: r.ai_analysis?.urgency_level ?? r.urgency_level ?? "unknown",
      dumping_pattern: r.ai_analysis?.dumping_pattern ?? r.dumping_pattern ?? null,
      timestamp: r.metadata?.processed_at ?? r.analyzed_at ?? null,
    }));
}

/**
 * Constructs the predictive Gemini prompt.
 *
 * @param {Record<string, any>[]} historicalData
 * @param {string}  weatherCondition
 * @param {boolean} isFestivalDay
 * @param {string|null} festivalName
 * @returns {string}
 */
function buildPredictionPrompt(historicalData, weatherCondition, isFestivalDay, festivalName) {
  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
  })();

  const festivalContext = isFestivalDay
    ? `Tomorrow is a festival day (${festivalName}). Expect significantly higher footfall, street-food vendors, and post-celebration waste volumes.`
    : "No major festival is scheduled for tomorrow.";

  return `You are a predictive urban sanitation AI for Madurai Municipal Corporation.
Predict tomorrow's (${tomorrowStr}) garbage risk zones based on the historical waste report data,
forecast weather, and festival context provided below.

Return ONLY strictly valid JSON — no markdown, no code fences, no extra explanation.

─────────────────────────────────────────────
CONTEXT
─────────────────────────────────────────────
Weather forecast for tomorrow: ${weatherCondition}
Festival context: ${festivalContext}

Historical waste reports (last 7 days, ${historicalData.length} records):
${JSON.stringify(historicalData, null, 2)}

─────────────────────────────────────────────
OUTPUT SCHEMA
─────────────────────────────────────────────
Return exactly this JSON structure:
{
  "predicted_risk_zones": [
    {
      "zone_name": "<human-readable area label, e.g. MG Road Market>",
      "latitude": <number or null>,
      "longitude": <number or null>,
      "risk_level": "<one of: low | medium | high | critical>",
      "predicted_waste_type": "<string — primary expected waste category>",
      "contributing_factors": ["<factor 1>", "<factor 2>"]
    }
  ],
  "risk_probability": <float 0.0–1.0 — overall citywide probability of high-risk garbage accumulation tomorrow>,
  "reasoning": "<2–4 sentence explanation of why these zones are predicted to be at risk>",
  "preventive_action_plan": "<3–5 actionable bullet-point recommendations for sanitation staff, separated by newlines>"
}

Rules:
- predicted_risk_zones must contain 1–5 entries based on actual data patterns.
- Base predictions on actual report locations and patterns — do not invent zones with no data basis.
- If lat/lng is unavailable for a zone, set both to null.
- risk_probability must reflect genuine data signal strength (low data = lower confidence → lower probability).
- Keep recommendations specific and actionable for municipal field workers.`;
}

/**
 * Parses and validates the Gemini prediction JSON response.
 *
 * @param {string} rawText
 * @returns {Object}  Validated prediction object.
 */
function parsePredictionResponse(rawText) {
  // Strip accidental markdown fences
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned non-JSON output. Raw: ${rawText}`);
  }

  // ── Required top-level keys ───────────────────────────────────────────────
  const requiredKeys = [
    "predicted_risk_zones",
    "risk_probability",
    "reasoning",
    "preventive_action_plan",
  ];

  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`Gemini response missing required field: "${key}"`);
    }
  }

  // ── Type & range checks ───────────────────────────────────────────────────
  if (!Array.isArray(parsed.predicted_risk_zones)) {
    throw new Error(`"predicted_risk_zones" must be an array.`);
  }
  if (
    typeof parsed.risk_probability !== "number" ||
    parsed.risk_probability < 0 ||
    parsed.risk_probability > 1
  ) {
    throw new Error(
      `"risk_probability" must be a float between 0.0 and 1.0. Got: ${parsed.risk_probability}`
    );
  }
  if (typeof parsed.reasoning !== "string" || !parsed.reasoning.trim()) {
    throw new Error(`"reasoning" must be a non-empty string.`);
  }
  if (typeof parsed.preventive_action_plan !== "string" || !parsed.preventive_action_plan.trim()) {
    throw new Error(`"preventive_action_plan" must be a non-empty string.`);
  }

  // ── Per-zone validation ───────────────────────────────────────────────────
  const validRiskLevels = new Set(["low", "medium", "high", "critical"]);
  const validatedZones = parsed.predicted_risk_zones
    .slice(0, 5) // cap at 5 zones silently
    .map((zone, idx) => {
      const prefix = `predicted_risk_zones[${idx}]`;

      if (!zone.zone_name || typeof zone.zone_name !== "string") {
        throw new Error(`${prefix}.zone_name must be a non-empty string.`);
      }
      if (!validRiskLevels.has(zone.risk_level)) {
        throw new Error(
          `${prefix}.risk_level "${zone.risk_level}" is invalid. Must be: ${[...validRiskLevels].join(", ")}`
        );
      }
      if (!zone.predicted_waste_type || typeof zone.predicted_waste_type !== "string") {
        throw new Error(`${prefix}.predicted_waste_type must be a non-empty string.`);
      }

      return {
        zone_name: String(zone.zone_name),
        latitude: typeof zone.latitude === "number" ? zone.latitude : null,
        longitude: typeof zone.longitude === "number" ? zone.longitude : null,
        risk_level: String(zone.risk_level),
        predicted_waste_type: String(zone.predicted_waste_type),
        contributing_factors: Array.isArray(zone.contributing_factors)
          ? zone.contributing_factors.map(String)
          : [],
      };
    });

  return {
    predicted_risk_zones: validatedZones,
    risk_probability: Number(parsed.risk_probability.toFixed(3)),
    reasoning: parsed.reasoning.trim(),
    preventive_action_plan: parsed.preventive_action_plan.trim(),
  };
}

// =============================================================================
// CLOUD FUNCTION 4 — predictGarbage
// =============================================================================

/**
 * POST /predictGarbage
 *
 * Fetches the last 7 days of waste reports from Firestore, merges in a
 * mock (or caller-supplied) weather value and festival flag, then calls
 * Gemini to produce a predictive risk analysis for tomorrow.
 *
 * Request body (all optional — sensible defaults are applied):
 * {
 *   "days":          7,                      // lookback window (default 7, max 30)
 *   "ward_id":       "WARD-07",              // filter to a specific ward
 *   "weather":       "Heavy rain expected",  // override mock weather
 *   "is_festival":   true,                   // override auto festival detection
 *   "festival_name": "Chithirai Festival"   // used when is_festival is overridden
 * }
 *
 * Success 200:
 * {
 *   "success": true,
 *   "report_count":          23,
 *   "lookback_days":         7,
 *   "prediction_for":        "2026-02-28",
 *   "generated_at":          "2026-02-27T13:17:43.000Z",
 *   "context": {
 *     "weather_condition":   "Heavy rain expected, 25°C",
 *     "is_festival_day":      false,
 *     "festival_name":        null
 *   },
 *   "predicted_risk_zones": [ … ],
 *   "risk_probability":      0.74,
 *   "reasoning":             "…",
 *   "preventive_action_plan":"…"
 * }
 */
exports.predictGarbage = onRequest(
  {
    timeoutSeconds: 120,
    memory: "512MiB",
    cors: true,
  },
  async (req, res) => {
    // ── Method guard ────────────────────────────────────────────────────────
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({ success: false, error: "Use POST or GET." });
    }

    // ── Parse inputs ────────────────────────────────────────────────────────
    const body = req.method === "GET" ? req.query : (req.body ?? {});

    const rawDays = parseInt(body.days ?? "7", 10);
    const wardFilter = body.ward_id ?? null;
    const weatherInput = body.weather ?? null;
    const festivalInput = body.is_festival ?? null;   // boolean override
    const festivalNameInput = body.festival_name ?? null;  // string override

    const lookbackDays = (!isNaN(rawDays) && rawDays >= 1 && rawDays <= 30)
      ? rawDays
      : 7;

    // ── Resolve context values ───────────────────────────────────────────────
    const weatherCondition = resolveMockWeather(weatherInput);

    // Festival: use caller override if supplied, otherwise auto-detect
    let isFestivalDay, festivalName;
    if (festivalInput !== null) {
      isFestivalDay = festivalInput === true || festivalInput === "true" || festivalInput === "1";
      festivalName = festivalNameInput ?? (isFestivalDay ? "Festival (user-specified)" : null);
    } else {
      ({ isFestival: isFestivalDay, festivalName } = detectUpcomingFestival());
    }

    const predictionDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().split("T")[0];
    })();

    const cutoff = Timestamp.fromDate(daysAgo(lookbackDays));

    console.info(
      `[predictGarbage] date=${predictionDate} | lookback=${lookbackDays}d` +
      ` | weather="${weatherCondition}" | festival=${isFestivalDay}` +
      (wardFilter ? ` | ward=${wardFilter}` : "")
    );

    try {
      // ── Step 1: Fetch historical reports from Firestore ──────────────────
      let fsQuery = db
        .collection(REPORTS_COL)
        .where("metadata.processed_at", ">=", cutoff)
        .orderBy("metadata.processed_at", "desc");

      if (wardFilter) {
        fsQuery = fsQuery.where("metadata.ward_id", "==", wardFilter);
      }

      const snapshot = await fsQuery.get();
      console.info(`[predictGarbage] Firestore returned ${snapshot.size} doc(s).`);

      // ── Step 2: Serialise docs + build slim historical summary ──────────
      const rawReports = snapshot.docs.map(serializeReport);
      const historicalData = buildHistoricalSummary(rawReports);

      // Graceful no-data path — still run prediction with empty history
      // so the model can reason from weather + festival context alone
      if (historicalData.length === 0) {
        console.warn("[predictGarbage] No historical reports found — prediction based on context only.");
      }

      // ── Step 3: Build prompt ─────────────────────────────────────────────
      const prompt = buildPredictionPrompt(
        historicalData,
        weatherCondition,
        isFestivalDay,
        festivalName
      );

      // ── Step 4: Call Gemini (low temperature = deterministic prediction) ─
      const predictionModel = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
          temperature: 0.15,  // Very low — predictive output must be stable
          topP: 0.85,
          maxOutputTokens: 2048,
        },
      });

      console.info("[predictGarbage] Calling Gemini...");
      const geminiResult = await predictionModel.generateContent(prompt);
      const rawText = geminiResult.response.text();
      console.info(`[predictGarbage] Gemini response length: ${rawText.length} chars`);

      // ── Step 5: Validate JSON ────────────────────────────────────────────
      const prediction = parsePredictionResponse(rawText);
      console.info(
        `[predictGarbage] Validated — ${prediction.predicted_risk_zones.length} zone(s)` +
        ` | risk_probability=${prediction.risk_probability}`
      );

      // ── Step 6: Return structured response ───────────────────────────────
      return res.status(200).json({
        success: true,
        report_count: rawReports.length,
        lookback_days: lookbackDays,
        prediction_for: predictionDate,
        generated_at: new Date().toISOString(),
        context: {
          weather_condition: weatherCondition,
          is_festival_day: isFestivalDay,
          festival_name: festivalName,
        },
        ...prediction,
      });
    } catch (error) {
      console.error("[predictGarbage] ERROR:", error);

      const isValidationError =
        error.message?.includes("missing required field") ||
        error.message?.includes("must be an array") ||
        error.message?.includes("must be a non-empty") ||
        error.message?.includes("must be a float") ||
        error.message?.includes("is invalid") ||
        error.message?.includes("non-JSON");

      return res.status(isValidationError ? 422 : 500).json({
        success: false,
        error: error.message || "Internal server error during garbage prediction.",
      });
    }
  }
);
