"use strict";

const speech = require("@google-cloud/speech");
const functions = require("firebase-functions");

const client = new speech.SpeechClient();

/**
 * Transcribes a Tamil audio recording using Google Speech-to-Text.
 * Optimized for Madurai Tamil dialect.
 *
 * @param {string} audioBase64 - Base64-encoded audio content
 * @param {string} encoding - Audio encoding format (LINEAR16, FLAC, MP3, etc.)
 * @param {number} sampleRateHertz - Sample rate of the audio
 * @returns {Promise<{ transcript: string, confidence: number, words: Array }>}
 */
async function transcribeTamilAudio(audioBase64, encoding, sampleRateHertz) {
  const request = {
    audio: {
      content: audioBase64,
    },
    config: {
      encoding: encoding,
      sampleRateHertz: sampleRateHertz,
      languageCode: "ta-IN",              // Tamil - India (primary)
      alternativeLanguageCodes: ["en-IN"], // Fallback for mixed Tamil-English
      model: "latest_long",
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      enableWordConfidence: true,
      useEnhanced: true,
      metadata: {
        interactionType: "VOICE_SEARCH",
        microphoneDistance: "NEARFIELD",
        recordingDeviceType: "SMARTPHONE",
        industryNaicsCodeOfAudio: 921120, // Public Administration
      },
      speechContexts: [
        {
          // Boost recognition of Madurai sanitation-specific vocabulary
          phrases: [
            "à®•à¯à®ªà¯à®ªà¯ˆ",        // kuppai - garbage
            "à®¨à®¾à®±à¯à®¤à¯",        // naaruthu - smells bad
            "à®µà®¾à®´à¯ˆ à®‡à®²à¯ˆ",     // vazhai illai - banana leaf
            "à®ªà¯‚ à®®à®¾à®²à¯ˆ",       // poo maalai - flower garland
            "à®¤à®£à¯à®£à¯€à®°à¯",       // thanneer - water
            "à®•à®´à®¿à®µà®Ÿà¯ˆ",       // kazhivadai - drain
            "à®¤à¯†à®°à¯à®µà®¿à®²à¯",     // theruvil - on the street
            "à®¨à®¾à®¯à¯",          // nai - dog
            "à®®à¯€à®©à®¾à®Ÿà¯à®šà®¿",    // Meenakshi
            "à®µà¯ˆà®•à¯ˆ",         // Vaigai
            "à®¤à¯‚à®¯à¯à®®à¯ˆ",       // thooimai - cleanliness
            "kuppai",
            "naaruthu",
            "vazhai illai",
            "poo maalai",
          ],
          boost: 15,
        },
      ],
    },
  };

  console.info("Initiating Tamil speech transcription", {
    encoding,
    sampleRateHertz,
  });

  const [response] = await client.recognize(request);

  if (!response.results || response.results.length === 0) {
    return {
      transcript: "",
      confidence: 0,
      words: [],
      languageDetected: "ta-IN",
    };
  }

  // Aggregate results from all speech segments
  const fullTranscript = response.results
    .map((r) => r.alternatives[0]?.transcript || "")
    .join(" ")
    .trim();

  const avgConfidence =
    response.results.reduce(
      (sum, r) => sum + (r.alternatives[0]?.confidence || 0),
      0
    ) / response.results.length;

  // Flatten word-time offsets for analysis
  const words = response.results.flatMap(
    (r) =>
      r.alternatives[0]?.words?.map((w) => ({
        word: w.word,
        confidence: w.confidence,
        startTime: w.startTime?.seconds || 0,
        endTime: w.endTime?.seconds || 0,
      })) || []
  );

  return {
    transcript: fullTranscript,
    confidence: Math.round(avgConfidence * 100) / 100,
    words,
    languageDetected: "ta-IN",
    segmentCount: response.results.length,
  };
}

/**
 * Handles long audio files (>1 minute) using the async longrunningrecognize API.
 * Audio must be stored in Google Cloud Storage.
 *
 * @param {string} gcsUri - GCS URI of the audio file (gs://bucket/file.wav)
 * @param {string} encoding - Audio encoding
 * @param {number} sampleRateHertz - Sample rate
 * @returns {Promise<object>} Transcription result
 */
async function transcribeLongAudio(gcsUri, encoding, sampleRateHertz) {
  const request = {
    audio: { uri: gcsUri },
    config: {
      encoding,
      sampleRateHertz,
      languageCode: "ta-IN",
      alternativeLanguageCodes: ["en-IN"],
      model: "latest_long",
      enableAutomaticPunctuation: true,
      enableWordConfidence: true,
      useEnhanced: true,
      speechContexts: [
        {
          phrases: ["à®•à¯à®ªà¯à®ªà¯ˆ", "à®¨à®¾à®±à¯à®¤à¯", "à®µà®¾à®´à¯ˆ à®‡à®²à¯ˆ", "à®ªà¯‚ à®®à®¾à®²à¯ˆ", "à®•à®´à®¿à®µà®Ÿà¯ˆ"],
          boost: 15,
        },
      ],
    },
  };

  const [operation] = await client.longRunningRecognize(request);
  const [response] = await operation.promise();

  const fullTranscript = response.results
    .map((r) => r.alternatives[0]?.transcript || "")
    .join(" ")
    .trim();

  return {
    transcript: fullTranscript,
    confidence:
      response.results.reduce(
        (sum, r) => sum + (r.alternatives[0]?.confidence || 0),
        0
      ) / (response.results.length || 1),
    segmentCount: response.results.length,
  };
}

module.exports = {
  transcribeTamilAudio,
  transcribeLongAudio,
};
