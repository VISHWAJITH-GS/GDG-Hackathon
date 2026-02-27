"use strict";

const { LANDMARKS } = require("./locationConstants");

/**
 * Calculates the Haversine distance between two geo-coordinates.
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lng1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lng2 - Longitude of point 2 (degrees)
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks all Madurai landmarks and determines if a given coordinate
 * falls within any "red zone" radius.
 *
 * @param {number} lat - Complaint latitude
 * @param {number} lng - Complaint longitude
 * @returns {{ isRedZone: boolean, zone: string|null, nearestLandmark: string|null, distanceMeters: number|null }}
 */
function checkRedZoneProximity(lat, lng) {
  let nearest = null;
  let minDist = Infinity;

  for (const [key, landmark] of Object.entries(LANDMARKS)) {
    const dist = haversineDistance(lat, lng, landmark.lat, landmark.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = { key, ...landmark, distanceMeters: Math.round(dist) };
    }
  }

  const isRedZone = minDist <= nearest.redZoneRadiusMeters;

  return {
    isRedZone,
    flag: isRedZone ? "Code Red: Pilgrimage Zone" : null,
    nearestLandmark: nearest.name,
    zone: nearest.zone,
    distanceMeters: nearest.distanceMeters,
  };
}

/**
 * Calculates a location-aware priority score (1–10).
 * Complaints closer to sensitive landmarks receive higher priority.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} severityScore - Base severity from AI (1–10)
 * @returns {number} Final priority score (1–10)
 */
function calculatePriorityScore(lat, lng, severityScore) {
  const templeDistance = haversineDistance(
    lat, lng,
    LANDMARKS.MEENAKSHI_TEMPLE.lat,
    LANDMARKS.MEENAKSHI_TEMPLE.lng
  );
  const riverDistance = haversineDistance(
    lat, lng,
    LANDMARKS.VAIGAI_RIVER.lat,
    LANDMARKS.VAIGAI_RIVER.lng
  );

  const minDist = Math.min(templeDistance, riverDistance);

  // Proximity bonus: max +4 at 0m, tapering to 0 at 2000m
  const proximityBonus = Math.max(0, 4 * (1 - minDist / 2000));

  const rawScore = severityScore + proximityBonus;
  return Math.min(10, Math.round(rawScore * 10) / 10);
}

/**
 * Returns the location zone label based on nearest landmark and distance.
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
function getLocationZone(lat, lng) {
  const { isRedZone, zone, nearestLandmark, distanceMeters } =
    checkRedZoneProximity(lat, lng);

  if (isRedZone) {
    return `Red Zone - ${zone} (${distanceMeters}m from ${nearestLandmark})`;
  }
  if (distanceMeters < 1500) {
    return `Buffer Zone - Near ${nearestLandmark} (${distanceMeters}m)`;
  }
  return `General Urban Zone`;
}

module.exports = {
  haversineDistance,
  checkRedZoneProximity,
  calculatePriorityScore,
  getLocationZone,
};
