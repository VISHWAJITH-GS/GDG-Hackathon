"use strict";

const { GoogleGenerativeAI } = require("@google/generative-ai");
const functions = require("firebase-functions");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: "v1" });

// Gemini 1.5 Flash — handles multimodal image comparison
const proModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 0.1,
    topP: 0.8,
    maxOutputTokens: 1024,
    responseMimeType: "application/json",
  },
});

/**
 * Compares a before and after cleanup image to verify that:
 * 1. Both images show the same physical location
 * 2. The trash visible in the before image has been removed
 * 3. No signs of fraud (cropping, different location, hidden trash)
 *
 * Uses Gemini 1.5 Pro for high-accuracy multimodal comparison.
 *
 * @param {string} beforeImageBase64 - Base64 before image
 * @param {string} afterImageBase64  - Base64 after image
 * @returns {Promise<object>} Verification result
 */
async function verifyCleanup(beforeImageBase64, afterImageBase64) {
  const prompt = `You are a fraud detection AI for the Madurai Municipal Corporation.

You are given TWO images:
- Image 1 (BEFORE): taken at the waste site before cleanup
- Image 2 (AFTER): submitted by the cleanup worker as proof of work

Your tasks:
1. Determine if both images show the SAME physical location (match background structures, walls, road features)
2. Determine if the visible trash in Image 1 has been REMOVED in Image 2
3. Detect any fraud: different location cropped in, garbage pushed out of frame, photoshop artifacts, suspicious changes
4. Assign a fraud_probability between 0.0 (definitely genuine) and 1.0 (definitely fraudulent)

Rules for verification_status:
- "Approved": same_location=true AND trash_removed=true AND fraud_probability < 0.35
- "Rejected": any other condition

Return ONLY valid JSON â€” no markdown, no explanation:
{
  "same_location": <true|false>,
  "trash_removed": <true|false>,
  "fraud_probability": <0.0-1.0>,
  "verification_status": "Approved | Rejected",
  "confidence": <0.0-1.0>,
  "notes": "<brief observation about what was compared>"
}`;

  const request = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { data: beforeImageBase64, mimeType: "image/jpeg" } },
          { inlineData: { data: afterImageBase64, mimeType: "image/jpeg" } },
        ],
      },
    ],
  };

  const response = await proModel.generateContent(request);
  const raw = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!raw) {
    throw new Error("verifyCleanup: Gemini Pro returned empty response");
  }

  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("verifyCleanup: JSON parse failed", { raw });
    throw new Error(`verifyCleanup: AI returned malformed JSON â€” ${err.message}`);
  }
}

module.exports = { verifyCleanup };
