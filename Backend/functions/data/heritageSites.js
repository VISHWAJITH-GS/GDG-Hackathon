"use strict";

/**
 * Madurai landmark coordinates used for distance-based zone classification.
 * Coordinates are accurate GPS positions verified against Google Maps.
 */

const HERITAGE_SITES = {
  MEENAKSHI_TEMPLE: {
    name: "Meenakshi Amman Temple",
    latitude: 9.9196,
    longitude: 78.1193,
    redZoneRadiusMeters: 500,
    zone: "Temple Core Zone",
  },
  VAIGAI_RIVER: {
    name: "Vaigai River",
    latitude: 9.9329,
    longitude: 78.1198,
    redZoneRadiusMeters: 500,
    zone: "Vaigai Riverfront Zone",
  },
  THIRUMALAI_NAYAK_PALACE: {
    name: "Thirumalai Nayak Palace",
    latitude: 9.9149,
    longitude: 78.1249,
    redZoneRadiusMeters: 300,
    zone: "Heritage Palace Zone",
  },
};

module.exports = { HERITAGE_SITES };
