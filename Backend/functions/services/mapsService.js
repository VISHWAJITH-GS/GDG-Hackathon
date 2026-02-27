"use strict";

const axios = require("axios");
const functions = require("firebase-functions");

const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";
const DISTANCE_BASE = "https://maps.googleapis.com/maps/api/distancematrix/json";
const PLACES_BASE = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

/**
 * Reverse geocodes GPS coordinates into a human-readable address.
 * Provides ward and locality data for Madurai addresses.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<object>} Address components
 */
async function reverseGeocode(latitude, longitude) {
  if (!MAPS_API_KEY) {
    console.warn("GOOGLE_MAPS_API_KEY not set â€” skipping geocoding");
    return { formattedAddress: `${latitude}, ${longitude}`, locality: "Unknown" };
  }

  const response = await axios.get(GEOCODE_BASE, {
    params: {
      latlng: `${latitude},${longitude}`,
      key: MAPS_API_KEY,
      language: "en",
      result_type: "sublocality|locality|political",
    },
    timeout: 5000,
  });

  if (response.data.status !== "OK" || !response.data.results.length) {
    console.warn("Geocoding returned no results", {
      lat: latitude,
      lng: longitude,
      status: response.data.status,
    });
    return { formattedAddress: `${latitude}, ${longitude}`, locality: "Unknown" };
  }

  const result = response.data.results[0];
  const components = result.address_components;

  const extract = (type) =>
    components.find((c) => c.types.includes(type))?.long_name || null;

  return {
    formattedAddress: result.formatted_address,
    locality: extract("sublocality_level_1") || extract("locality"),
    city: extract("locality") || extract("administrative_area_level_2"),
    district: extract("administrative_area_level_2"),
    state: extract("administrative_area_level_1"),
    postalCode: extract("postal_code"),
    placeId: result.place_id,
  };
}

/**
 * Gets road/driving distance between two points using Distance Matrix API.
 * Useful for routing sanitation trucks.
 *
 * @param {object} origin - { lat, lng }
 * @param {object} destination - { lat, lng }
 * @returns {Promise<{ distanceMeters: number, durationSeconds: number, distanceText: string }>}
 */
async function getRoadDistance(origin, destination) {
  if (!MAPS_API_KEY) {
    return { distanceMeters: null, durationSeconds: null, distanceText: "N/A" };
  }

  const response = await axios.get(DISTANCE_BASE, {
    params: {
      origins: `${origin.lat},${origin.lng}`,
      destinations: `${destination.lat},${destination.lng}`,
      key: MAPS_API_KEY,
      mode: "driving",
      language: "en",
    },
    timeout: 5000,
  });

  const element = response.data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") {
    return { distanceMeters: null, durationSeconds: null, distanceText: "N/A" };
  }

  return {
    distanceMeters: element.distance.value,
    durationSeconds: element.duration.value,
    distanceText: element.distance.text,
    durationText: element.duration.text,
  };
}

/**
 * Finds nearby sanitation facilities using Places API.
 * Used for agentic disposal unit lookup fallback.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} keyword - e.g., "waste disposal", "medical waste"
 * @param {number} radiusMeters - search radius (default 5000m)
 * @returns {Promise<Array<object>>}
 */
async function findNearbyFacilities(latitude, longitude, keyword, radiusMeters = 5000) {
  if (!MAPS_API_KEY) {
    return [];
  }

  const response = await axios.get(PLACES_BASE, {
    params: {
      location: `${latitude},${longitude}`,
      radius: radiusMeters,
      keyword,
      key: MAPS_API_KEY,
      language: "en",
    },
    timeout: 5000,
  });

  if (response.data.status === "ZERO_RESULTS") return [];

  return (response.data.results || []).slice(0, 5).map((place) => ({
    name: place.name,
    vicinity: place.vicinity,
    latitude: place.geometry.location.lat,
    longitude: place.geometry.location.lng,
    placeId: place.place_id,
    rating: place.rating || null,
  }));
}

module.exports = {
  reverseGeocode,
  getRoadDistance,
  findNearbyFacilities,
};
