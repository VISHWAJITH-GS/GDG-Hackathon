"use strict";

const functions = require("firebase-functions");

/**
 * Centralized error handler for Express routes.
 * Formats all errors into a consistent JSON response.
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.status || err.statusCode || 500;

  functions.logger.error("Request error", {
    path: req.path,
    method: req.method,
    errorCode: err.code || "INTERNAL_ERROR",
    message: err.message,
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });

  const body = {
    success: false,
    error: {
      code: err.code || "INTERNAL_ERROR",
      message: err.message || "An unexpected error occurred",
    },
  };

  if (err.details) {
    body.error.details = err.details;
  }

  res.status(statusCode).json(body);
}

/**
 * Wraps an async route handler to forward errors to the error handler middleware.
 *
 * @param {Function} fn - Async Express route handler
 * @returns {Function}
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Creates a structured application error.
 *
 * @param {string} message
 * @param {number} status - HTTP status code
 * @param {string} code - Application error code
 * @returns {Error}
 */
function createError(message, status = 500, code = "INTERNAL_ERROR") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

module.exports = { errorHandler, asyncHandler, createError };
