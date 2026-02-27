"use strict";

const Joi = require("joi");

/** Schema for /analyze-image request body */
const analyzeImageSchema = Joi.object({
  imageBase64: Joi.string().required(),
  mimeType: Joi.string()
    .valid("image/jpeg", "image/png", "image/webp", "image/gif")
    .default("image/jpeg"),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  wardNumber: Joi.number().integer().min(1).max(100).optional(),
  reportedBy: Joi.string().optional(),
});

/** Schema for /analyze-audio request body */
const analyzeAudioSchema = Joi.object({
  audioBase64: Joi.string().required(),
  encoding: Joi.string()
    .valid("LINEAR16", "FLAC", "MP3", "OGG_OPUS", "WEBM_OPUS", "AMR", "AMR_WB")
    .default("LINEAR16"),
  sampleRateHertz: Joi.number().integer().default(16000),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  wardNumber: Joi.number().integer().min(1).max(100).optional(),
  reportedBy: Joi.string().optional(),
});

/** Schema for /verify-cleanup request body */
const verifyCleanupSchema = Joi.object({
  complaintId: Joi.string().required(),
  beforeImageBase64: Joi.string().required(),
  afterImageBase64: Joi.string().required(),
  mimeType: Joi.string()
    .valid("image/jpeg", "image/png", "image/webp")
    .default("image/jpeg"),
  workerId: Joi.string().required(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
});

/** Schema for /restore-heritage request body */
const restoreHeritageSchema = Joi.object({
  imageBase64: Joi.string().required(),
  mimeType: Joi.string()
    .valid("image/jpeg", "image/png", "image/webp")
    .default("image/jpeg"),
  locationDescription: Joi.string().optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
});

/**
 * Validates a request body against a Joi schema.
 * Throws a structured error if validation fails.
 *
 * @param {object} data - Request body
 * @param {Joi.ObjectSchema} schema - Joi schema to validate against
 * @returns {object} Validated and defaulted data
 */
function validate(data, schema) {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    const details = error.details.map((d) => ({
      field: d.path.join("."),
      message: d.message,
    }));

    const validationError = new Error("Request validation failed");
    validationError.status = 400;
    validationError.code = "VALIDATION_ERROR";
    validationError.details = details;
    throw validationError;
  }

  return value;
}

module.exports = {
  validate,
  schemas: {
    analyzeImage: analyzeImageSchema,
    analyzeAudio: analyzeAudioSchema,
    verifyCleanup: verifyCleanupSchema,
    restoreHeritage: restoreHeritageSchema,
  },
};
