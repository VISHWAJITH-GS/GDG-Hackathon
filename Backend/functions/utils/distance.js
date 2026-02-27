"use strict";

const { getDistance } = require("geolib");
const { HERITAGE_SITES } = require("../data/heritageSites");

/**
 * Calculates the distance in meters between a complaint location
 * and every Madurai heritage landmark.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {{ distances: object, nearestSite: object, isRedZone: boolean, locationZone: string }}
 */
function analyzeProximity(latitude, longitude) {
  const point = { latitude, longitude };
  const distances = {};
  let nearestSite = null;
  let minDistance = Infinity;

  for (const [key, site] of Object.entries(HERITAGE_SITES)) {
    const distMeters = getDistance(point, {
      latitude: site.latitude,
      longitude: site.longitude,
    });

    distances[key] = {
      name: site.name,
      distanceMeters: distMeters,
      withinRedZone: distMeters <= site.redZoneRadiusMeters,
    };

    if (distMeters < minDistance) {
      minDistance = distMeters;
      nearestSite = { ...site, key, distanceMeters: distMeters };
    }
  }

  const isRedZone = nearestSite.distanceMeters <= nearestSite.redZoneRadiusMeters;

  let locationZone;
  if (isRedZone) {
    locationZone = `Code Red: Pilgrimage Zone (${nearestSite.distanceMeters}m from ${nearestSite.name})`;
  } else if (nearestSite.distanceMeters <= 1500) {
    locationZone = `Buffer Zone — Near ${nearestSite.name} (${nearestSite.distanceMeters}m)`;
  } else {
    locationZone = "General Urban Zone";
  }

  return {
    distances,
    nearestSite,
    isRedZone,
    locationZone,
  };
}

/**
 * Returns a numeric priority score (1–10) boosted by proximity to landmarks.
 * Closer to red zones = higher priority.
 *
 * @param {number} severityScore - AI-generated severity (1–10)
 * @param {number} distanceToNearestMeters
 * @returns {number}
 */
function computePriorityScore(severityScore, distanceToNearestMeters) {
  // Proximity bonus: +3 at 0m, linearly falls to 0 at 2000m
  const proximityBonus = Math.max(0, 3 * (1 - distanceToNearestMeters / 2000));
  return Math.min(10, Math.round((severityScore + proximityBonus) * 10) / 10);
}

module.exports = { analyzeProximity, computePriorityScore };
