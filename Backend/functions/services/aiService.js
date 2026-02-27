"use strict";

const { GoogleGenerativeAI } = require("@google/generative-ai");
const functions = require("firebase-functions");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn("[aiService] GEMINI_API_KEY is not set in environment.");
}

// Single client — reused across warm invocations
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Gemini 2.5 Flash — fast, cost-efficient, great for structured JSON tasks
const flashModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.1,
    topP: 0.8,
    maxOutputTokens: 1024,
    responseMimeType: "application/json", // forces JSON output
  },
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// analyzeWasteImage
// Acts as a Madurai Sanitation Inspector. Classifies waste, estimates volume,
// detects banana leaves and garlands, scores severity.
//
// Priority score and location_zone are injected AFTER the AI call
// using server-side geolib calculation â€” not delegated to the model.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * @param {string} imageBase64 - Base64-encoded image
 * @param {string} locationZone - Pre-computed zone string from distance.js
 * @param {number} priorityScore - Pre-computed score from distance.js
 * @returns {Promise<object>} Structured waste analysis
 */
async function analyzeWasteImage(imageBase64, locationZone, priorityScore) {
  const prompt = `You are a Madurai Sanitation Inspector AI working for Madurai Municipal Corporation, Tamil Nadu, India.

Analyze this waste image and return ONLY a valid JSON object â€” no markdown, no code blocks, no explanation.

Classify the waste using Madurai-specific categories:
- "Temple Waste": banana leaves (vazhai illai), flower garlands (maalai), coconut shells, camphor, puja items
- "Tourist Waste": plastic bottles, food wrappers, disposable containers
- "Mixed Waste": combination of the above or general urban garbage
- "Biological Hazard": dead animals, medical/biomedical waste, chemical containers

Detection rules:
- Explicitly check for banana leaves and flower garlands and list them in detected_items if present
- Estimate volume based on the visible pile area and depth in the image
- Severity 1-3 = minor litter, 4-6 = moderate accumulation, 7-9 = large pile, 10 = severe hazard

Return exactly this JSON schema (use these exact field names):
{
  "waste_type": "Temple Waste | Tourist Waste | Mixed Waste | Biological Hazard",
  "estimated_volume_m3": <number>,
  "detected_items": ["<item1>", "<item2>"],
  "severity_score": <integer 1-10>,
  "priority_score": ${priorityScore},
  "location_zone": "${locationZone}",
  "recommended_action": "<specific actionable instruction for sanitation crew>",
  "confidence": <number 0.0-1.0>,
  "is_hazard": <true if waste_type is Biological Hazard, else false>
}`;

  const request = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { data: imageBase64, mimeType: "image/jpeg" } },
        ],
      },
    ],
  };

  const response = await flashModel.generateContent(request);
  return parseJsonResponse(response, "analyzeWasteImage");
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// classifyAudioComplaint
// Classifies a Tamil speech transcript into a structured complaint category.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * @param {string} transcript - Transcribed Tamil/English text
 * @returns {Promise<object>} Classified complaint
 */
async function classifyAudioComplaint(transcript) {
  const prompt = `You are a Tamil language complaint classifier for Madurai Municipal Corporation.

The following text was transcribed from a Tamil voice complaint (may be Tamil script, transliterated Tamil, or mixed Tamil-English):
"${transcript}"

Common Madurai Tamil phrases and their meanings:
- naaruthu / à®¨à®¾à®±à¯à®¤à¯ â†’ Bad Odor / Hygiene Issue
- kuppai / à®•à¯à®ªà¯à®ªà¯ˆ â†’ Garbage Accumulation
- thanneer nikka iruku / à®¤à®£à¯à®£à¯€à®°à¯ â†’ Water Stagnation
- vazhai illai / à®µà®¾à®´à¯ˆ à®‡à®²à¯ˆ â†’ Banana Leaf Waste
- poo maalai / à®ªà¯‚ à®®à®¾à®²à¯ˆ â†’ Flower Garland Waste
- nai irandhuduchu â†’ Dead Animal
- kazhivadai â†’ Drainage Blockage

Return ONLY valid JSON â€” no markdown, no explanation:
{
  "original_text": "${transcript}",
  "translated_text": "<English translation>",
  "category": "Bad Odor | Garbage Accumulation | Water Stagnation | Temple Waste | Dead Animal | Drainage Blockage | General Complaint",
  "severity": <integer 1-10>
}`;

  const request = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  const response = await flashModel.generateContent(request);
  return parseJsonResponse(response, "classifyAudioComplaint");
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// predictRiskFromHistory
// Reasons over ward complaint history to produce a risk score.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * @param {number} ward
 * @param {Array<object>} history - Recent complaints from Firestore
 * @returns {Promise<object>} Risk prediction
 */
async function predictRiskFromHistory(ward, history) {
  const summary = history.slice(0, 40).map((c) => ({
    date: c.createdAt,
    type: c.waste_type,
    severity: c.severity_score,
    zone: c.location_zone,
  }));

  const prompt = `You are a predictive sanitation analytics AI for Madurai Municipal Corporation.

Analyze the complaint history for Ward ${ward} and predict the sanitation risk score.

Today: ${new Date().toISOString()}
Complaint data (last 90 days): ${JSON.stringify(summary)}

Consider:
1. Frequency and severity trends
2. Festival risk: Chitirai (April), Pongal (January), Navaratri (October), Karthigai (November)
3. Repeat locations or escalating severity
4. Proximity patterns to temple / river

Return ONLY valid JSON:
{
  "ward": ${ward},
  "risk_score": <number 0.0-1.0>,
  "reason": "<concise explanation>",
  "trend": "Improving | Stable | Worsening",
  "festival_alert": "<upcoming festival name or null>"
}`;

  const request = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  const response = await flashModel.generateContent(request);
  return parseJsonResponse(response, "predictRiskFromHistory");
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Internal helper â€” safely parses Gemini JSON response
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function parseJsonResponse(response, callerName) {
  const raw = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!raw) {
    throw new Error(`${callerName}: Gemini returned empty response`);
  }

  // Strip accidental markdown fences if present despite responseMimeType
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`${callerName}: JSON parse failed`, { raw });
    throw new Error(`${callerName}: AI returned malformed JSON â€” ${err.message}`);
  }
}

module.exports = {
  analyzeWasteImage,
  classifyAudioComplaint,
  predictRiskFromHistory,
};
