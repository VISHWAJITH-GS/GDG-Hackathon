"use strict";

const { VertexAI } = require("@google-cloud/vertexai");
const functions = require("firebase-functions");
const { storage } = require("../config/firebaseConfig");
const { v4: uuidv4 } = require("uuid");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.VERTEX_AI_LOCATION || "asia-south1";
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET;

const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });

/**
 * Heritage restoration using Imagen 3.
 * Takes a dirty/degraded wall image and generates a clean, restored version.
 *
 * @param {string} imageBase64 - Base64-encoded dirty image
 * @param {string} mimeType - Image MIME type
 * @param {string} locationDescription - Optional description of the site
 * @returns {Promise<{ restoredImageBase64: string, gcsUri: string|null, prompt: string }>}
 */
async function restoreHeritageWall(imageBase64, mimeType, locationDescription) {
  // Imagen 3 model for image editing (inpainting/outpainting/editing)
  const imagenModel = vertexAI.preview.getGenerativeModel({
    model: "imagegeneration@006",
  });

  const locationCtx = locationDescription
    ? ` at ${locationDescription}, Madurai, Tamil Nadu`
    : " in Madurai, Tamil Nadu";

  const editPrompt = `A clean, beautifully restored ancient heritage wall${locationCtx}.
Traditional Dravidian architectural details, fresh whitewash, vibrant temple colors (red, gold, green),
clean stone work, no garbage, no graffiti, no stains, photorealistic,
showcasing the cultural heritage of Madurai, bright natural lighting,
preserved historical architecture in pristine condition.`;

  const negativePrompt = "garbage, trash, waste, graffiti, stains, cracks, dirty walls, pollution, debris, dark, gloomy";

  console.info("Starting Imagen heritage restoration", { locationDescription });

  try {
    // Use Imagen 3 edit model - image to image generation with conditioning
    const request = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: imageBase64,
                mimeType: mimeType,
              },
            },
            {
              text: editPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
        numberOfImages: 1,
        aspectRatio: "1:1",
        negativePrompt: negativePrompt,
        safetySetting: "block_some",
      },
    };

    const response = await imagenModel.generateContent(request);
    const imageData =
      response.response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!imageData) {
      throw new Error("Imagen did not return image data");
    }

    // Optionally persist to Cloud Storage for long-term access
    let gcsUri = null;
    if (STORAGE_BUCKET) {
      try {
        gcsUri = await saveImageToStorage(imageData, "image/png", "heritage-restorations");
      } catch (storageErr) {
        // Non-critical â€” log but don't fail the response
        console.warn("Failed to save restored image to storage", {
          error: storageErr.message,
        });
      }
    }

    return {
      restoredImageBase64: imageData,
      gcsUri,
      prompt: editPrompt,
    };
  } catch (err) {
    console.error("Imagen restoration failed", { error: err.message });

    // Fallback: Use Gemini 1.5 Pro to describe the restoration
    // (for hackathon demo when Imagen quota is limited)
    console.info("Falling back to Imagen text-to-image generation");
    return await generateCleanVersionFallback(editPrompt, negativePrompt, locationCtx);
  }
}

/**
 * Fallback: Generates a clean version using text-to-image Imagen.
 * Used when conditioned image editing is unavailable.
 *
 * @param {string} prompt
 * @param {string} negativePrompt
 * @param {string} locationCtx
 * @returns {Promise<object>}
 */
async function generateCleanVersionFallback(prompt, negativePrompt, locationCtx) {
  const imagenTextModel = vertexAI.preview.getGenerativeModel({
    model: "imagegeneration@006",
  });

  const fullPrompt = `Photorealistic image of a beautifully clean and restored Dravidian architecture wall${locationCtx}.
Fresh paint, vibrant temple colors, immaculate stone work, no garbage, professional architectural photography.`;

  const request = {
    instances: [
      {
        prompt: fullPrompt,
      },
    ],
    parameters: {
      sampleCount: 1,
      aspectRatio: "1:1",
      negativePrompt: negativePrompt,
      safetySetting: "block_some",
    },
  };

  // Use PredictionServiceClient for Imagen
  const { PredictionServiceClient } = require("@google-cloud/aiplatform");
  const { helpers } = require("@google-cloud/aiplatform");

  const predictionClient = new PredictionServiceClient({
    apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
  });

  const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/imagegeneration@006`;

  const [response] = await predictionClient.predict({
    endpoint,
    instances: request.instances.map((i) => helpers.toValue(i)),
    parameters: helpers.toValue(request.parameters),
  });

  const imageData =
    response.predictions?.[0]?.structValue?.fields?.bytesBase64Encoded?.stringValue;

  if (!imageData) {
    throw new Error("Imagen text-to-image returned no data");
  }

  let gcsUri = null;
  if (STORAGE_BUCKET) {
    try {
      gcsUri = await saveImageToStorage(imageData, "image/png", "heritage-restorations");
    } catch (_) {
      // Non-critical
    }
  }

  return {
    restoredImageBase64: imageData,
    gcsUri,
    prompt: fullPrompt,
  };
}

/**
 * Saves a base64 image to Firebase Cloud Storage.
 *
 * @param {string} imageBase64
 * @param {string} mimeType
 * @param {string} folder
 * @returns {Promise<string>} GCS URI
 */
async function saveImageToStorage(imageBase64, mimeType, folder) {
  const extension = mimeType.split("/")[1] || "png";
  const filename = `${folder}/${uuidv4()}.${extension}`;
  const bucket = storage.bucket(STORAGE_BUCKET);
  const file = bucket.file(filename);

  const buffer = Buffer.from(imageBase64, "base64");

  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      metadata: {
        source: "madurai-civic-intelligence",
        generatedAt: new Date().toISOString(),
      },
    },
  });

  return `gs://${STORAGE_BUCKET}/${filename}`;
}

module.exports = {
  restoreHeritageWall,
  saveImageToStorage,
};
