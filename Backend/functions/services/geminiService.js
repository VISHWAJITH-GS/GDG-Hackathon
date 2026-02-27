"use strict";

const { VertexAI } = require("@google-cloud/vertexai");
const functions = require("firebase-functions");
const {
  calculatePriorityScore,
  getLocationZone,
} = require("../utils/distanceCalculator");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.VERTEX_AI_LOCATION || "asia-south1";

const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });

// Gemini 1.5 Pro â€” for complex multimodal analysis and image comparison
const geminiPro = vertexAI.getGenerativeModel({
  model: "gemini-1.5-pro-002",
  generationConfig: {
    temperature: 0.1,          // Low temperature for consistent structured output
    topP: 0.8,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
  },
  safetySettings: [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
  ],
});

// Gemini 1.5 Flash â€” for lightweight text classification tasks
const geminiFlash = vertexAI.getGenerativeModel({
  model: "gemini-1.5-flash-002",
  generationConfig: {
    temperature: 0.1,
    topP: 0.8,
    maxOutputTokens: 1024,
    responseMimeType: "application/json",
  },
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// IMAGE ANALYSIS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Analyzes a waste image as a Madurai Sanitation Inspector.
 *
 * @param {string} imageBase64 - Base64-encoded image data
 * @param {string} mimeType - MIME type of the image
 * @param {number} latitude - Location latitude
 * @param {number} longitude - Location longitude
 * @returns {Promise<object>} Structured analysis JSON
 */
async function analyzeWasteImage(imageBase64, mimeType, latitude, longitude) {
  const locationZone = getLocationZone(latitude, longitude);

  const systemPrompt = `You are an AI-powered Madurai Sanitation Inspector working for the Madurai Municipal Corporation.
You have been trained on hyper-local waste patterns specific to Madurai, Tamil Nadu, India.

You are analyzing a photograph taken at: ${locationZone}

Your expertise includes recognizing:
- Temple Waste: banana leaves (vazhai illai), flower garlands (maalai), coconut shells, camphor, incense
- Tourist Waste: plastic bottles, food wrappers, PET containers, disposable cutlery
- Mixed Urban Waste: household garbage, construction debris, bio-waste
- Hazardous Materials: dead animals, medical/biomedical waste, chemical containers
- Festival Waste: leftover puja items, clay idols, flower offerings

CRITICAL RULES:
1. You MUST respond with ONLY valid JSON. No markdown, no explanations, no code blocks.
2. All numeric values must be actual numbers, not strings.
3. The confidence field must be between 0.0 and 1.0.
4. severity_score must be between 1 and 10.
5. priority_score will be calculated externally â€” set it to the same as severity_score.
6. For detected_items, list each item you can clearly see.
7. If you detect dead animals, biomedical waste, or chemical hazards, set waste_type to "Biological Hazard".`;

  const userPrompt = `Analyze this waste image and return ONLY a JSON object matching this exact schema:
{
  "waste_type": "Temple Waste | Tourist Waste | Mixed | Biological Hazard | Construction Waste | Unknown",
  "estimated_volume_m3": <estimate cubic meters based on visible area>,
  "detected_items": ["<item1>", "<item2>"],
  "severity_score": <integer 1-10>,
  "priority_score": <integer 1-10, same as severity for now>,
  "location_zone": "${locationZone}",
  "recommended_action": "<specific action>",
  "confidence": <0.0 to 1.0>,
  "hazard_flags": {
    "is_biological_hazard": false,
    "has_dead_animal": false,
    "has_biomedical_waste": false,
    "has_chemical_waste": false
  }
}`;

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: mimeType,
    },
  };

  const request = {
    contents: [
      {
        role: "user",
        parts: [
          { text: systemPrompt + "\n\n" + userPrompt },
          imagePart,
        ],
      },
    ],
  };

  const response = await geminiPro.generateContent(request);
  const rawText = response.response.candidates[0].content.parts[0].text;

  let analysisResult;
  try {
    analysisResult = JSON.parse(rawText);
  } catch (parseErr) {
    console.error("Failed to parse Gemini image analysis response", {
      rawText,
      parseErr: parseErr.message,
    });
    throw new Error("AI returned malformed JSON for image analysis");
  }

  // Override location_zone with server-computed value (authoritative)
  analysisResult.location_zone = locationZone;

  // Override priority_score with server-computed proximity-aware value
  analysisResult.priority_score = calculatePriorityScore(
    latitude,
    longitude,
    analysisResult.severity_score
  );

  return analysisResult;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CLEANUP VERIFICATION (Proof of Work)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Verifies a before/after cleanup using Gemini 1.5 Pro multimodal comparison.
 *
 * @param {string} beforeImageBase64
 * @param {string} afterImageBase64
 * @param {string} mimeType
 * @returns {Promise<object>} Verification result JSON
 */
async function verifyCleanupImages(beforeImageBase64, afterImageBase64, mimeType) {
  const prompt = `You are a fraud detection AI for the Madurai Municipal Corporation Sanitation Department.
You will be shown TWO images side by side: a BEFORE image (with garbage) and an AFTER image (allegedly cleaned).

Your job is to:
1. Determine if both images show the same physical location (matching background, walls, road markings, buildings)
2. Determine if the trash/waste visible in the BEFORE image has been removed in the AFTER image
3. Detect any signs of fraud: cropping to hide garbage, using a completely different location, photoshop artifacts
4. Estimate the probability of fraud

CRITICAL RULES:
- Respond ONLY with valid JSON. No markdown, no text outside the JSON.
- fraud_probability must be between 0.0 (definitely clean) and 1.0 (definitely fraud)
- verification_status: "Approved" if same_location=true AND trash_removed=true AND fraud_probability < 0.3
- verification_status: "Rejected" otherwise
- Partially cleaned locations should have trash_removed=false

Return exactly this JSON schema:
{
  "same_location": <true|false>,
  "trash_removed": <true|false>,
  "fraud_probability": <0.0 to 1.0>,
  "verification_status": "Approved | Rejected | Manual Review Required",
  "confidence": <0.0 to 1.0>,
  "observations": {
    "location_match_evidence": "<what visual elements match>",
    "cleaning_evidence": "<what changed between before and after>",
    "fraud_indicators": "<any suspicious elements>"
  }
}

BEFORE image (first image) and AFTER image (second image):`;

  const request = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { data: beforeImageBase64, mimeType } },
          { inlineData: { data: afterImageBase64, mimeType } },
        ],
      },
    ],
  };

  const response = await geminiPro.generateContent(request);
  const rawText = response.response.candidates[0].content.parts[0].text;

  let result;
  try {
    result = JSON.parse(rawText);
  } catch (parseErr) {
    console.error("Failed to parse cleanup verification response", {
      rawText,
      parseErr: parseErr.message,
    });
    throw new Error("AI returned malformed JSON for cleanup verification");
  }

  return result;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PREDICTIVE RISK ANALYSIS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Analyzes Firestore complaint history to predict sanitation risk for a ward.
 *
 * @param {number} wardNumber
 * @param {Array<object>} complaintHistory - Recent complaints from Firestore
 * @param {object} wardMeta - Ward metadata
 * @returns {Promise<object>} Risk prediction JSON
 */
async function predictWardRisk(wardNumber, complaintHistory, wardMeta) {
  const historyJson = JSON.stringify(complaintHistory.slice(0, 50)); // Cap to avoid token overflow
  const today = new Date().toISOString();

  const prompt = `You are a predictive analytics AI for Madurai Municipal Corporation.
Analyze the sanitation complaint history for Ward ${wardNumber} and predict the risk score.

Ward Information:
${JSON.stringify(wardMeta)}

Today's Date: ${today}

Recent Complaint History (last 90 days):
${historyJson}

Instructions:
1. Analyze complaint frequency, severity trends, waste types
2. Check for festival-related spikes (Chitirai, Pongal, Navaratri, Karthigai)
3. Consider proximity to temples, Vaigai River in historical complaints
4. Calculate a risk score from 0.0 (very clean) to 1.0 (critical)
5. Return ONLY valid JSON with no markdown

Return exactly this schema:
{
  "ward": ${wardNumber},
  "risk_score": <0.0 to 1.0>,
  "risk_level": "Low | Medium | High | Critical",
  "reason": "<concise explanation of why this score>",
  "top_issues": ["<issue1>", "<issue2>"],
  "festival_risk": {
    "upcoming_festival": "<name or null>",
    "expected_waste_multiplier": <number>,
    "preparation_advised": <true|false>
  },
  "recommended_actions": ["<action1>", "<action2>"],
  "trend": "Improving | Stable | Worsening"
}`;

  const request = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  const response = await geminiFlash.generateContent(request);
  const rawText = response.response.candidates[0].content.parts[0].text;

  let result;
  try {
    result = JSON.parse(rawText);
  } catch (parseErr) {
    console.error("Failed to parse risk prediction response", {
      rawText,
      parseErr: parseErr.message,
    });
    throw new Error("AI returned malformed JSON for risk prediction");
  }

  return result;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// AUDIO TRANSCRIPTION CLASSIFICATION
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Classifies a Tamil complaint transcription into a structured category.
 *
 * @param {string} transcribedText - Text from Speech-to-Text
 * @returns {Promise<object>} Classified complaint JSON
 */
async function classifyAudioComplaint(transcribedText) {
  const prompt = `You are a Tamil language complaint classifier for Madurai Municipal Corporation.

You will receive transcribed Tamil speech (possibly in Tamil script, transliterated Tamil, or mixed with English).
Classify the complaint into a structured sanitation category.

Transcribed text: "${transcribedText}"

Common Madurai Tamil phrases and their meanings:
- "Inga romba naaruthu / à®¨à®¾à®±à¯à®¤à¯" â†’ Bad Odor / Hygiene Issue
- "Kuppai pottu irukanga / à®•à¯à®ªà¯à®ªà¯ˆ" â†’ Garbage Accumulation
- "Thanneer nikka iruku / à®¤à®£à¯à®£à¯€à®°à¯" â†’ Water Stagnation
- "Vazhai illai / à®µà®¾à®´à¯ˆ à®‡à®²à¯ˆ" â†’ Banana Leaf Waste (Temple)
- "Poo, maalai / à®ªà¯‚ à®®à®¾à®²à¯ˆ" â†’ Flower Garland Waste (Temple)
- "Nai irandhuduchu / à®¨à®¾à®¯à¯ à®‡à®±à®¨à¯à®¤à¯à®Ÿà¯à®šà¯à®šà¯" â†’ Dead Animal
- "Kazhivadai / à®•à®´à®¿à®µà®Ÿà¯ˆ" â†’ Drainage Blockage
- "Thengai / à®¤à¯‡à®™à¯à®•à®¾à®¯à¯" â†’ Coconut Waste

CRITICAL RULES:
- Return ONLY valid JSON
- category must be one of: ["Bad Odor", "Garbage Accumulation", "Water Stagnation", "Temple Waste", "Dead Animal", "Drainage Blockage", "Hazardous Waste", "General Complaint"]
- urgency: "Low" | "Medium" | "High" | "Emergency"

Return exactly this schema:
{
  "original_transcription": "${transcribedText}",
  "english_translation": "<translation>",
  "category": "<category>",
  "sub_category": "<specific sub-category>",
  "urgency": "<urgency level>",
  "action_required": "<recommended municipal action>",
  "is_hazardous": <true|false>,
  "confidence": <0.0 to 1.0>
}`;

  const request = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  const response = await geminiFlash.generateContent(request);
  const rawText = response.response.candidates[0].content.parts[0].text;

  let result;
  try {
    result = JSON.parse(rawText);
  } catch (parseErr) {
    console.error("Failed to parse audio classification response", {
      rawText,
      parseErr: parseErr.message,
    });
    throw new Error("AI returned malformed JSON for audio classification");
  }

  return result;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// HAZARD NOTIFICATION MESSAGE GENERATION
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Generates a formal Tamil + English bilingual notification for hazardous waste.
 *
 * @param {object} analysisResult - Image analysis result
 * @param {object} location - { latitude, longitude, zone }
 * @param {object} disposalUnit - Nearest disposal unit from Firestore
 * @returns {Promise<object>} Bilingual notification texts
 */
async function generateHazardNotification(analysisResult, location, disposalUnit) {
  const prompt = `You are generating a formal emergency notification for the Madurai Municipal Corporation Zonal Officer.

Hazard Details:
${JSON.stringify(analysisResult, null, 2)}

Location: ${location.zone} (${location.latitude}, ${location.longitude})

Nearest Disposal Unit:
${JSON.stringify(disposalUnit, null, 2)}

Generate a formal bilingual (Tamil + English) emergency notification.

Return ONLY this JSON:
{
  "sms_tamil": "<SMS in Tamil, max 160 chars>",
  "sms_english": "<SMS in English, max 160 chars>",
  "email_subject": "<Email subject in English>",
  "email_body_tamil": "<Full formal Tamil email body>",
  "email_body_english": "<Full formal English email body>",
  "priority": "EMERGENCY",
  "escalation_required": <true|false>
}`;

  const request = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  const response = await geminiFlash.generateContent(request);
  const rawText = response.response.candidates[0].content.parts[0].text;

  let result;
  try {
    result = JSON.parse(rawText);
  } catch (parseErr) {
    console.error("Failed to parse hazard notification response", {
      rawText,
      parseErr: parseErr.message,
    });
    throw new Error("AI returned malformed JSON for hazard notification");
  }

  return result;
}

module.exports = {
  analyzeWasteImage,
  verifyCleanupImages,
  predictWardRisk,
  classifyAudioComplaint,
  generateHazardNotification,
};
