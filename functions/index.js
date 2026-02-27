/**
 * M-Clean | Madurai Municipal Corporation
 * Firebase Cloud Function: analyzeWaste
 *
 * Flow:
 *  1. Receive image URL + metadata via HTTP POST
 *  2. Send image to Google Cloud Vision API for label detection
 *  3. Send Vision labels + metadata to Gemini API for structured analysis
 *  4. Validate JSON response
 *  5. Save structured result into the Firestore report document
 */

const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const vision = require("@google-cloud/vision");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ---------------------------------------------------------------------------
// Environment variable placeholders
// ---------------------------------------------------------------------------
// Set these in your Firebase project:
//   firebase functions:secrets:set GEMINI_API_KEY
//   or define them in .env / firebase.json env vars
//
// For local development, create a functions/.env file:
//   GEMINI_API_KEY=your_gemini_api_key_here
//   GCP_PROJECT_ID=your_gcp_project_id
//   FIRESTORE_COLLECTION=reports
// ---------------------------------------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "REPLACE_WITH_YOUR_GEMINI_API_KEY";
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "REPLACE_WITH_YOUR_GCP_PROJECT_ID";
const FIRESTORE_COLLECTION = process.env.FIRESTORE_COLLECTION || "reports";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-pro";

// ---------------------------------------------------------------------------
// Global initializations
// ---------------------------------------------------------------------------
setGlobalOptions({ region: "asia-south1" }); // Close to Madurai, India

initializeApp();
const db = getFirestore();
const visionClient = new vision.ImageAnnotatorClient({ projectId: GCP_PROJECT_ID });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VISION_MAX_LABELS = 15;
const GEMINI_TEMPERATURE = 0.2; // Low temperature → more deterministic, structured output

const GEMINI_PROMPT_TEMPLATE = (labels, metadata) => `
You are an AI sanitation analyst for Madurai Municipal Corporation.
Analyze the following waste report data and return strictly valid JSON with no markdown, no code blocks, no extra text — just raw JSON.

Vision API detected labels: ${labels}

Report metadata:
- Location: Latitude ${metadata.latitude ?? "unknown"}, Longitude ${metadata.longitude ?? "unknown"}
- Timestamp: ${metadata.timestamp ?? new Date().toISOString()}
- Reporter notes: ${metadata.notes ?? "None provided"}
- Area description: ${metadata.area_description ?? "Not provided"}

Return ONLY this JSON structure (fill in all fields):
{
  "waste_type": "string — e.g. 'Household Garbage', 'Construction Debris', 'Biomedical Waste'",
  "severity_score": number between 1 (minor) and 10 (critical),
  "dumping_pattern": "string — e.g. 'One-time dump', 'Repeated illegal dumping', 'Gradual accumulation'",
  "area_type_guess": "string — e.g. 'Residential street', 'Market area', 'Roadside', 'Open plot'",
  "urgency_level": "string — one of: 'Low', 'Medium', 'High', 'Critical'",
  "confidence": number between 0.0 and 1.0 representing confidence in the analysis
}
`.trim();

// ---------------------------------------------------------------------------
// Helper: Call Google Vision API for label detection
// ---------------------------------------------------------------------------
async function detectLabelsFromUrl(imageUrl) {
    const [result] = await visionClient.labelDetection({
        image: { source: { imageUri: imageUrl } },
    });

    const labels = result.labelAnnotations || [];

    if (labels.length === 0) {
        throw new Error("Vision API returned no labels for the provided image.");
    }

    // Return top N labels with description and score
    return labels.slice(0, VISION_MAX_LABELS).map((label) => ({
        description: label.description,
        score: parseFloat((label.score ?? 0).toFixed(3)),
    }));
}

// ---------------------------------------------------------------------------
// Helper: Call Gemini API with Vision labels + metadata
// ---------------------------------------------------------------------------
async function analyzeWithGemini(visionLabels, metadata) {
    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
            temperature: GEMINI_TEMPERATURE,
            responseMimeType: "application/json", // Force JSON-only output
        },
    });

    const labelsText = visionLabels
        .map((l) => `${l.description} (confidence: ${l.score})`)
        .join(", ");

    const prompt = GEMINI_PROMPT_TEMPLATE(labelsText, metadata);

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    return rawText;
}

// ---------------------------------------------------------------------------
// Helper: Parse and validate Gemini JSON response
// ---------------------------------------------------------------------------
function parseAndValidateGeminiResponse(rawText) {
    let parsed;

    // Strip any accidental markdown code fences (safety net)
    const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

    try {
        parsed = JSON.parse(cleaned);
    } catch (err) {
        throw new Error(`Gemini returned invalid JSON. Raw response: ${rawText}. Parse error: ${err.message}`);
    }

    // Required field validation
    const requiredFields = [
        "waste_type",
        "severity_score",
        "dumping_pattern",
        "area_type_guess",
        "urgency_level",
        "confidence",
    ];

    for (const field of requiredFields) {
        if (parsed[field] === undefined || parsed[field] === null) {
            throw new Error(`Gemini response missing required field: "${field}". Raw: ${rawText}`);
        }
    }

    // Type & range validation
    if (typeof parsed.severity_score !== "number" || parsed.severity_score < 1 || parsed.severity_score > 10) {
        throw new Error(`severity_score must be a number between 1–10. Got: ${parsed.severity_score}`);
    }

    if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
        throw new Error(`confidence must be a number between 0.0–1.0. Got: ${parsed.confidence}`);
    }

    const validUrgencyLevels = ["Low", "Medium", "High", "Critical"];
    if (!validUrgencyLevels.includes(parsed.urgency_level)) {
        throw new Error(`urgency_level must be one of ${validUrgencyLevels.join(", ")}. Got: ${parsed.urgency_level}`);
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

// ---------------------------------------------------------------------------
// Helper: Save AI analysis result into a Firestore report document
// ---------------------------------------------------------------------------
async function saveAnalysisToFirestore(reportId, analysis, visionLabels, imageUrl, metadata) {
    const docRef = db.collection(FIRESTORE_COLLECTION).doc(reportId);

    // Merge AI analysis into existing report document (non-destructive update)
    await docRef.set(
        {
            ai_analysis: {
                ...analysis,
                vision_labels: visionLabels,
                analyzed_at: FieldValue.serverTimestamp(),
            },
            status: analysis.urgency_level === "Critical" ? "flagged" : "analyzed",
            image_url: imageUrl,
            metadata: {
                ...metadata,
                processed_at: FieldValue.serverTimestamp(),
            },
            updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true } // Preserve any existing fields (e.g. reporter info)
    );

    return docRef.id;
}

// ---------------------------------------------------------------------------
// Main Cloud Function: analyzeWaste
// ---------------------------------------------------------------------------
exports.analyzeWaste = onRequest(
    {
        timeoutSeconds: 120,       // Vision + Gemini calls can take time
        memory: "512MiB",
        cors: true,                // Allow calls from the frontend PWA
    },
    async (req, res) => {
        // Only accept POST
        if (req.method !== "POST") {
            return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
        }

        const { image_url: imageUrl, report_id: reportId, metadata = {} } = req.body;

        // Input validation
        if (!imageUrl || typeof imageUrl !== "string") {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid 'image_url' in request body.",
            });
        }

        if (!reportId || typeof reportId !== "string") {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid 'report_id' in request body.",
            });
        }

        console.log(`[analyzeWaste] Processing report: ${reportId} | Image: ${imageUrl}`);

        try {
            // ------------------------------------------------------------------
            // Step 1 → Google Vision API: Label Detection
            // ------------------------------------------------------------------
            console.log("[analyzeWaste] Step 1: Calling Vision API...");
            const visionLabels = await detectLabelsFromUrl(imageUrl);
            console.log(`[analyzeWaste] Vision labels detected: ${visionLabels.map((l) => l.description).join(", ")}`);

            // ------------------------------------------------------------------
            // Step 2 → Gemini API: Structured Waste Analysis
            // ------------------------------------------------------------------
            console.log("[analyzeWaste] Step 2: Calling Gemini API...");
            const rawGeminiResponse = await analyzeWithGemini(visionLabels, metadata);
            console.log(`[analyzeWaste] Gemini raw response: ${rawGeminiResponse}`);

            // ------------------------------------------------------------------
            // Step 3 → Validate Gemini JSON
            // ------------------------------------------------------------------
            console.log("[analyzeWaste] Step 3: Validating Gemini JSON response...");
            const analysis = parseAndValidateGeminiResponse(rawGeminiResponse);
            console.log(`[analyzeWaste] Validated analysis:`, JSON.stringify(analysis));

            // ------------------------------------------------------------------
            // Step 4 → Firestore: Save structured result into report document
            // ------------------------------------------------------------------
            console.log(`[analyzeWaste] Step 4: Saving analysis to Firestore (report: ${reportId})...`);
            await saveAnalysisToFirestore(reportId, analysis, visionLabels, imageUrl, metadata);
            console.log(`[analyzeWaste] Analysis saved successfully for report: ${reportId}`);

            // ------------------------------------------------------------------
            // Response
            // ------------------------------------------------------------------
            return res.status(200).json({
                success: true,
                report_id: reportId,
                analysis,
                vision_labels: visionLabels,
                message: "Waste analysis complete and saved to Firestore.",
            });
        } catch (error) {
            console.error(`[analyzeWaste] ERROR for report ${reportId}:`, error);

            // Differentiate between known validation errors and unexpected failures
            const isValidationError = error.message.includes("missing required field") ||
                error.message.includes("invalid JSON") ||
                error.message.includes("must be a number");

            return res.status(isValidationError ? 422 : 500).json({
                success: false,
                report_id: reportId,
                error: error.message || "Internal server error during waste analysis.",
            });
        }
    }
);
