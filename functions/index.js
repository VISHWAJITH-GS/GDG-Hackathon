// =============================================================================
// functions/index.js
// Firebase Cloud Functions — M-Clean | Madurai Municipal Corporation
//
// Exported functions:
//   1. analyzeWaste        - HTTP POST: Vision → Gemini → Firestore pipeline
//   2. calculateWardScore  - HTTP POST: Compute ward cleanliness score
//   3. detectHotspots      - HTTP POST: 7-day Firestore reports → Gemini hotspot analysis
//   4. predictGarbage      - HTTP POST: 7-day data + weather/festival → Gemini risk prediction
//   5. allocateWorkforce   - HTTP POST: Hotspots + resources → deterministic workforce plan
//   6. generateDailyReport - HTTP POST: Hotspots + score + predictions → Gemini 150-word report
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

// =============================================================================
// SECTION 5 — allocateWorkforce (pure deterministic logic, no AI/Firestore)
// =============================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Numeric weight assigned to each urgency label (higher = more urgent). */
const URGENCY_WEIGHT = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Base worker-hours needed to clear one unit of waste.
 * Severity score (1–10) is multiplied by this factor.
 */
const BASE_HOURS_PER_SEVERITY_UNIT = 0.5;

/**
 * Truck capacity multiplier: each truck halves the time for its assigned zone
 * (they can haul more per trip, reducing round-trips).
 */
const TRUCK_TIME_REDUCTION_FACTOR = 0.5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a risk / urgency string to a numeric priority weight.
 * Accepts both urgency labels (critical/high/medium/low) and
 * raw severity scores (1–10) to stay compatible with both
 * detectHotspots and predictGarbage output shapes.
 *
 * @param {string|number} value
 * @returns {number}  Priority weight (higher = more urgent)
 */
function toPriorityWeight(value) {
  if (typeof value === "number") {
    // Map a 1–10 severity score into the same 1–4 band as urgency labels
    if (value >= 9) return 4; // critical
    if (value >= 7) return 3; // high
    if (value >= 4) return 2; // medium
    return 1;                  // low
  }
  const key = String(value).toLowerCase().trim();
  return URGENCY_WEIGHT[key] ?? 1;
}

/**
 * Sorts hotspots by descending priority weight, then by descending severity
 * score as a tiebreaker, then alphabetically by name for deterministic output.
 *
 * @param {ProcessedHotspot[]} hotspots
 * @returns {ProcessedHotspot[]}
 */
function sortByPriority(hotspots) {
  return [...hotspots].sort((a, b) => {
    if (b.priorityWeight !== a.priorityWeight) return b.priorityWeight - a.priorityWeight;
    if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore;
    return a.name.localeCompare(b.name); // deterministic tiebreaker
  });
}

/**
 * Distributes `total` integer units across N slots proportionally to each
 * slot's weight. Guarantees every slot gets at least 1 unit, and the total
 * is exactly `total` (surplus is given to the highest-weight slots).
 *
 * @param {number[]} weights
 * @param {number}   total
 * @returns {number[]}
 */
function distributeProportionally(weights, total) {
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1;
  // Base allocation (floor)
  const allocs = weights.map((w) => Math.max(1, Math.floor((w / weightSum) * total)));
  let assigned = allocs.reduce((s, v) => s + v, 0);

  // Distribute remainder to highest-weight slots first
  const sorted = weights
    .map((w, i) => ({ i, w }))
    .sort((a, b) => b.w - a.w);

  for (const { i } of sorted) {
    if (assigned >= total) break;
    allocs[i]++;
    assigned++;
  }

  // If clamping minimums pushed total over, trim from lowest-weight slots
  const sortedAsc = [...sorted].reverse();
  for (const { i } of sortedAsc) {
    if (assigned <= total) break;
    if (allocs[i] > 1) { allocs[i]--; assigned--; }
  }

  return allocs;
}

/**
 * Generates a human-readable route strategy string based on the sorted list.
 *
 * @param {object[]} prioritized  Sorted, allocated hotspot objects.
 * @returns {string}
 */
function buildRouteStrategy(prioritized) {
  if (prioritized.length === 0) return "No hotspots to service.";
  if (prioritized.length === 1) {
    return `Deploy all resources directly to ${prioritized[0].name}. Single-zone operation — no routing required.`;
  }

  const criticalZones = prioritized.filter((h) => h.priorityWeight === 4);
  const highZones = prioritized.filter((h) => h.priorityWeight === 3);
  const remaining = prioritized.filter((h) => h.priorityWeight <= 2);

  const parts = [];

  if (criticalZones.length) {
    parts.push(
      `Immediately deploy maximum resources to CRITICAL zone(s): ${criticalZones.map((z) => z.name).join(", ")
      }. Clear before moving to secondary areas.`
    );
  }
  if (highZones.length) {
    parts.push(
      `HIGH priority zones (${highZones.map((z) => z.name).join(", ")
      }) should be addressed in parallel by split teams once critical zones are stabilised.`
    );
  }
  if (remaining.length) {
    parts.push(
      `Remaining zones (${remaining.map((z) => z.name).join(", ")
      }) are serviced last using residual capacity.`
    );
  }

  parts.push(
    "Trucks should follow the priority order for collection routes, " +
    "minimising backtracking by clustering geographically adjacent zones within the same priority band."
  );

  return parts.join(" ");
}

/**
 * Core workforce allocation algorithm — exported for unit testing.
 *
 * @param {object} input
 * @param {object[]} input.hotspots        Raw hotspot objects from the request.
 * @param {number}   input.num_workers     Total available workers.
 * @param {number}   input.num_trucks      Total available trucks.
 * @returns {{
 *   allocation_plan:           string,
 *   priority_order:            object[],
 *   route_strategy:            string,
 *   estimated_completion_hours: number
 * }}
 */
function allocateWorkforceLogic({ hotspots, num_workers, num_trucks }) {
  const workers = Math.max(1, Math.floor(Number(num_workers) || 1));
  const trucks = Math.max(1, Math.floor(Number(num_trucks) || 1));

  // ── Normalise each hotspot into a consistent internal shape ────────────────
  /**
   * @typedef {{
   *   name:          string,
   *   severityScore: number,
   *   urgencyLabel:  string,
   *   priorityWeight:number,
   *   latitude:      number|null,
   *   longitude:     number|null,
   *   wasteType:     string,
   *   reportCount:   number
   * }} ProcessedHotspot
   */
  const processed = hotspots.map((h, idx) => {
    // Accept both snake_case (detectHotspots output) and camelCase variants
    const name = h.name || h.zone_name ||
      h.location_description || `Zone ${idx + 1}`;
    const severity = Number(h.severity_score ?? h.severity ?? h.avg_severity ?? 5);
    const urgency = h.urgency_level ?? h.risk_level ?? h.urgency ?? "medium";

    return {
      name,
      severityScore: isNaN(severity) ? 5 : Math.min(10, Math.max(1, severity)),
      urgencyLabel: String(urgency).toLowerCase(),
      priorityWeight: toPriorityWeight(urgency) || toPriorityWeight(severity),
      latitude: h.latitude ?? h.lat ?? null,
      longitude: h.longitude ?? h.lng ?? null,
      wasteType: h.waste_type ?? h.dominant_waste_type ?? h.predicted_waste_type ?? "Mixed Waste",
      reportCount: Number(h.report_count ?? h.reportCount ?? 1),
    };
  });

  // ── Sort by priority (descending urgency → severity → name) ───────────────
  const sorted = sortByPriority(processed);

  // ── Distribute workers + trucks proportionally to priority weights ────────
  const weights = sorted.map((h) => h.priorityWeight);
  const workerAllocs = distributeProportionally(weights, workers);
  const truckAllocs = distributeProportionally(weights, trucks);

  // ── Estimate completion time per zone, then take the max (parallel ops) ──
  // Formula: base_hours = severity × BASE_HOURS_PER_SEVERITY_UNIT
  //          per_worker = base_hours / workers_assigned
  //          with_truck = per_worker × TRUCK_TIME_REDUCTION_FACTOR (if truck present)
  const zoneEstimates = sorted.map((h, i) => {
    const baseHours = h.severityScore * BASE_HOURS_PER_SEVERITY_UNIT;
    const perWorker = baseHours / workerAllocs[i];
    const hasTruck = truckAllocs[i] > 0;
    return hasTruck ? perWorker * TRUCK_TIME_REDUCTION_FACTOR : perWorker;
  });

  const maxZoneHours = zoneEstimates.length ? Math.max(...zoneEstimates) : 0;
  // Round up to nearest 0.5 h for a realistic operational estimate
  const estimatedHours = Math.ceil(maxZoneHours * 2) / 2;

  // ── Build priority_order output array ─────────────────────────────────────
  const priority_order = sorted.map((h, i) => ({
    rank: i + 1,
    zone_name: h.name,
    urgency_level: h.urgencyLabel,
    severity_score: h.severityScore,
    waste_type: h.wasteType,
    latitude: h.latitude,
    longitude: h.longitude,
    report_count: h.reportCount,
    workers_assigned: workerAllocs[i],
    trucks_assigned: truckAllocs[i],
    estimated_zone_hours: Math.ceil(zoneEstimates[i] * 2) / 2,
  }));

  // ── Build human-readable allocation plan ───────────────────────────────
  const planLines = [
    `WORKFORCE ALLOCATION PLAN — Madurai Municipal Corporation`,
    `Total resources: ${workers} worker(s), ${trucks} truck(s) across ${sorted.length} zone(s).`,
    `──────────────────────────────────────────────────`,
    ...priority_order.map((z) =>
      `Rank ${z.rank} [${z.urgency_level.toUpperCase()}] ${z.zone_name}\n` +
      `  Waste type : ${z.waste_type}\n` +
      `  Severity   : ${z.severity_score}/10\n` +
      `  Workers    : ${z.workers_assigned}\n` +
      `  Trucks     : ${z.trucks_assigned}\n` +
      `  Est. time  : ${z.estimated_zone_hours} hr(s)`
    ),
    `──────────────────────────────────────────────────`,
    `Overall estimated completion: ${estimatedHours} hr(s) (parallel team deployment).`,
  ];

  const allocation_plan = planLines.join("\n");

  // ── Build route strategy ────────────────────────────────────────────
  const route_strategy = buildRouteStrategy(sorted);

  return {
    allocation_plan,
    priority_order,
    route_strategy,
    estimated_completion_hours: estimatedHours,
  };
}

// =============================================================================
// CLOUD FUNCTION 5 — allocateWorkforce
// =============================================================================

/**
 * POST /allocateWorkforce
 *
 * Deterministically allocates sanitation workers and trucks across a set of
 * hotspot zones, ordered by severity / urgency.
 *
 * Request body:
 * {
 *   "hotspots": [                          // required — array of zone objects
 *     {
 *       "name":           "MG Road",       // or zone_name / location_description
 *       "severity_score": 8,              // 1–10 (also accepts avg_severity)
 *       "urgency_level":  "high",         // or risk_level: low|medium|high|critical
 *       "waste_type":     "Household Waste",
 *       "latitude":       9.9252,          // optional
 *       "longitude":      78.1198,         // optional
 *       "report_count":   12               // optional
 *     }
 *   ],
 *   "num_workers": 20,                     // required — total workers available
 *   "num_trucks":  5                       // required — total trucks available
 * }
 *
 * Success 200:
 * {
 *   "success": true,
 *   "zone_count": 3,
 *   "resources": { "workers": 20, "trucks": 5 },
 *   "allocation_plan":            "<human-readable multi-line plan>",
 *   "priority_order": [
 *     {
 *       "rank": 1, "zone_name": "...", "urgency_level": "critical",
 *       "severity_score": 9, "waste_type": "...",
 *       "latitude": null, "longitude": null, "report_count": 7,
 *       "workers_assigned": 10, "trucks_assigned": 3,
 *       "estimated_zone_hours": 2.5
 *     }
 *   ],
 *   "route_strategy":             "<human-readable routing instructions>",
 *   "estimated_completion_hours": 2.5
 * }
 *
 * Sorting logic:
 *   1. urgency_level (critical > high > medium > low)
 *   2. severity_score descending (tiebreaker)
 *   3. zone name alphabetically (deterministic final tiebreaker)
 *
 * Allocation logic:
 *   • Workers and trucks distributed proportionally to each zone’s priority weight.
 *   • Every zone guaranteed at least 1 worker and 1 truck.
 *   • Completion time = max zone time (teams work in parallel).
 *   • Zone time = (severity × 0.5h) ÷ workers_assigned × 0.5 (truck efficiency).
 */
exports.allocateWorkforce = onRequest(
  {
    timeoutSeconds: 30,     // pure logic — no external API calls
    memory: "256MiB",
    cors: true,
  },
  async (req, res) => {
    // ── Method guard ────────────────────────────────────────────────────────
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
    }

    const { hotspots, num_workers, num_trucks } = req.body ?? {};

    // ── Input validation ─────────────────────────────────────────────────────
    if (!Array.isArray(hotspots)) {
      return res.status(400).json({
        success: false,
        error: "`hotspots` must be an array of zone objects.",
      });
    }
    if (hotspots.length === 0) {
      return res.status(400).json({
        success: false,
        error: "`hotspots` array must not be empty.",
      });
    }
    if (hotspots.length > 50) {
      return res.status(400).json({
        success: false,
        error: "`hotspots` array must not exceed 50 zones.",
      });
    }
    if (num_workers === undefined || num_workers === null) {
      return res.status(400).json({ success: false, error: "`num_workers` is required." });
    }
    if (num_trucks === undefined || num_trucks === null) {
      return res.status(400).json({ success: false, error: "`num_trucks` is required." });
    }
    if (isNaN(Number(num_workers)) || Number(num_workers) < 1) {
      return res.status(400).json({ success: false, error: "`num_workers` must be a positive integer." });
    }
    if (isNaN(Number(num_trucks)) || Number(num_trucks) < 1) {
      return res.status(400).json({ success: false, error: "`num_trucks` must be a positive integer." });
    }

    console.info(
      `[allocateWorkforce] ${hotspots.length} zone(s) | workers=${num_workers} | trucks=${num_trucks}`
    );

    try {
      const result = allocateWorkforceLogic({ hotspots, num_workers, num_trucks });

      console.info(
        `[allocateWorkforce] Done — ${result.priority_order.length} zone(s) ranked` +
        ` | est. completion: ${result.estimated_completion_hours}h`
      );

      return res.status(200).json({
        success: true,
        zone_count: result.priority_order.length,
        resources: {
          workers: Math.max(1, Math.floor(Number(num_workers))),
          trucks: Math.max(1, Math.floor(Number(num_trucks))),
        },
        ...result,
      });
    } catch (error) {
      console.error("[allocateWorkforce] ERROR:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Internal server error during workforce allocation.",
      });
    }
  }
);

// =============================================================================
// Named exports for unit testing
// =============================================================================
exports._calculateWardScore = calculateWardScore;
exports._allocateWorkforceLogic = allocateWorkforceLogic;

// =============================================================================
// SECTION 6 — generateDailyReport helpers
// =============================================================================

/**
 * Formats a hotspot array into a compact bullet list for the Gemini prompt.
 *
 * @param {object[]} hotspots
 * @returns {string}
 */
function formatHotspotsForPrompt(hotspots) {
  if (!Array.isArray(hotspots) || hotspots.length === 0) {
    return "  • No significant hotspots recorded today.";
  }
  return hotspots
    .slice(0, 5) // cap at 5 to control token usage
    .map((h, i) => {
      const name = h.zone_name || h.location_description || h.name || `Zone ${i + 1}`;
      const severity = h.avg_severity ?? h.severity_score ?? h.severity ?? "N/A";
      const urgency = h.risk_level ?? h.urgency_level ?? h.urgency ?? "unknown";
      const waste = h.dominant_waste_type ?? h.waste_type ?? h.predicted_waste_type ?? "Mixed waste";
      return `  • ${name} | Severity: ${severity}/10 | Urgency: ${urgency} | Waste: ${waste}`;
    })
    .join("\n");
}

/**
 * Formats a predictions object into a readable summary for the prompt.
 *
 * @param {object|null} predictions
 * @returns {string}
 */
function formatPredictionsForPrompt(predictions) {
  if (!predictions || typeof predictions !== "object") {
    return "No predictive data available.";
  }
  const prob = predictions.risk_probability != null
    ? `${Math.round(predictions.risk_probability * 100)}%`
    : "unknown";
  const zones = Array.isArray(predictions.predicted_risk_zones)
    ? predictions.predicted_risk_zones.slice(0, 3).map((z) =>
      z.zone_name || z.name || "Unnamed zone"
    ).join(", ")
    : "Not specified";
  const action = predictions.preventive_action_plan
    ? predictions.preventive_action_plan.split("\n")[0].slice(0, 120)
    : "Standard patrol recommended.";

  return [
    `Tomorrow's citywide risk probability: ${prob}`,
    `At-risk zones: ${zones}`,
    `Priority action: ${action}`,
  ].join(" | ");
}

/**
 * Builds the Gemini prompt for the daily sanitation report.
 *
 * @param {object[]}   hotspots         Today's detected hotspots.
 * @param {number}     cleanlinessScore  Ward/city cleanliness score (0–100).
 * @param {string}     ratingCategory    "Clean" | "Moderate" | "Critical"
 * @param {object|null} predictions      Tomorrow's prediction payload.
 * @param {string}     reportDate        YYYY-MM-DD string for today.
 * @returns {string}
 */
function buildDailyReportPrompt(hotspots, cleanlinessScore, ratingCategory, predictions, reportDate) {
  const hotspotText = formatHotspotsForPrompt(hotspots);
  const predictionText = formatPredictionsForPrompt(predictions);

  return `You are an official AI civic report writer for Madurai Municipal Corporation.
Generate a 150-word professional municipal sanitation status report for ${reportDate}.

Use a formal, official government tone — similar to a District Collector's field report.
Do NOT use bullet points. Write in structured paragraphs.
Return ONLY strictly valid JSON with NO markdown, NO code fences, NO extra text:

Input data:
- City Cleanliness Score: ${cleanlinessScore}/100 (Rating: ${ratingCategory})
- Active hotspot zones today:
${hotspotText}
- Tomorrow's prediction summary: ${predictionText}

Return exactly this JSON structure:
{
  "summary_report": "<your 150-word official sanitation report here>"
}

The report must:
  1. Open with the date and overall cleanliness status.
  2. Briefly describe the active hotspot zones and their severity.
  3. Reference tomorrow's predicted risk and the recommended preventive action.
  4. Close with a formal directive to field supervisors.
  5. Be exactly around 150 words — not significantly shorter or longer.`;
}

/**
 * Parses and validates Gemini's daily-report JSON response.
 *
 * @param {string} rawText
 * @returns {{ summary_report: string }}
 */
function parseDailyReportResponse(rawText) {
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

  if (!("summary_report" in parsed)) {
    throw new Error(`Gemini response missing required field: "summary_report"`);
  }
  if (typeof parsed.summary_report !== "string" || !parsed.summary_report.trim()) {
    throw new Error(`"summary_report" must be a non-empty string.`);
  }

  // Soft word-count check — warn in logs but don’t reject (Gemini is approximate)
  const wordCount = parsed.summary_report.trim().split(/\s+/).length;
  if (wordCount < 80 || wordCount > 250) {
    console.warn(`[generateDailyReport] Unexpected word count: ${wordCount} (expected ~150).`);
  }

  return { summary_report: parsed.summary_report.trim() };
}

// =============================================================================
// CLOUD FUNCTION 6 — generateDailyReport
// =============================================================================

/**
 * POST /generateDailyReport
 *
 * Composes a 150-word official municipal sanitation report by feeding today’s
 * hotspot data, the cleanliness score, and tomorrow’s predictions into Gemini.
 *
 * Request body:
 * {
 *   "hotspots": [               // required — array of hotspot/zone objects
 *     {
 *       "zone_name":          "MG Road",
 *       "avg_severity":        7.5,
 *       "risk_level":          "high",
 *       "dominant_waste_type": "Household Garbage"
 *     }
 *   ],
 *   "cleanliness_score":  62,   // required — numeric 0–100
 *   "rating_category":   "Moderate",  // optional (derived if omitted)
 *   "predictions": {            // optional — output of predictGarbage
 *     "risk_probability":        0.74,
 *     "predicted_risk_zones":    [ ... ],
 *     "preventive_action_plan":  "Deploy extra trucks to ..."
 *   },
 *   "report_date": "2026-02-27"  // optional — defaults to today (IST)
 * }
 *
 * Success 200:
 * {
 *   "success":        true,
 *   "report_date":    "2026-02-27",
 *   "word_count":     148,
 *   "summary_report": "<150-word official report text>"
 * }
 *
 * Error 4xx/5xx:
 * { "success": false, "error": "..." }
 */
exports.generateDailyReport = onRequest(
  {
    timeoutSeconds: 60,
    memory: "256MiB",
    cors: true,
  },
  async (req, res) => {
    // ── Method guard ───────────────────────────────────────────────────────
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
    }

    const {
      hotspots,
      cleanliness_score,
      rating_category,
      predictions = null,
      report_date,
    } = req.body ?? {};

    // ── Input validation ────────────────────────────────────────────────────
    if (!Array.isArray(hotspots)) {
      return res.status(400).json({
        success: false,
        error: "`hotspots` must be an array.",
      });
    }
    if (cleanliness_score === undefined || cleanliness_score === null) {
      return res.status(400).json({
        success: false,
        error: "`cleanliness_score` is required.",
      });
    }
    const score = Number(cleanliness_score);
    if (isNaN(score) || score < 0 || score > 100) {
      return res.status(400).json({
        success: false,
        error: "`cleanliness_score` must be a number between 0 and 100.",
      });
    }

    // Derive rating category if not supplied
    const rating = String(rating_category ||
      (score >= 80 ? "Clean" : score >= 50 ? "Moderate" : "Critical")
    );

    // Resolve report date (default: today in IST, YYYY-MM-DD)
    const dateStr = report_date && typeof report_date === "string"
      ? report_date
      : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD

    console.info(
      `[generateDailyReport] date=${dateStr} | score=${score} | rating=${rating}` +
      ` | hotspots=${hotspots.length} | predictions=${predictions ? "yes" : "no"}`
    );

    try {
      // ── Build prompt ──────────────────────────────────────────────────
      const prompt = buildDailyReportPrompt(
        hotspots, score, rating, predictions, dateStr
      );

      // ── Call Gemini ───────────────────────────────────────────────────
      // Slightly higher temperature than analytical functions —
      // reports need some linguistic variation while staying factual.
      const reportModel = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 512,  // 150 words ≈ 200 tokens; headroom for JSON wrapper
        },
      });

      console.info("[generateDailyReport] Calling Gemini...");
      const geminiResult = await reportModel.generateContent(prompt);
      const rawText = geminiResult.response.text();
      console.info(`[generateDailyReport] Gemini response length: ${rawText.length} chars`);

      // ── Validate JSON ─────────────────────────────────────────────────
      const { summary_report } = parseDailyReportResponse(rawText);
      const wordCount = summary_report.split(/\s+/).length;
      console.info(`[generateDailyReport] Report generated: ${wordCount} words.`);

      // ── Return ─────────────────────────────────────────────────────────
      return res.status(200).json({
        success: true,
        report_date: dateStr,
        word_count: wordCount,
        summary_report,
      });
    } catch (error) {
      console.error("[generateDailyReport] ERROR:", error);

      const isValidationError =
        error.message?.includes("missing required field") ||
        error.message?.includes("must be a non-empty") ||
        error.message?.includes("non-JSON");

      return res.status(isValidationError ? 422 : 500).json({
        success: false,
        error: error.message || "Internal server error during report generation.",
      });
    }
  }
);
