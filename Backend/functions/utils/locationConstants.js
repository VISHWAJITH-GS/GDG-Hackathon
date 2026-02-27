"use strict";

/**
 * Hyper-local landmark coordinates for Madurai.
 * All coordinates are verified GPS positions.
 */
const LANDMARKS = {
  MEENAKSHI_TEMPLE: {
    name: "Meenakshi Amman Temple",
    lat: 9.9196,
    lng: 78.1193,
    zone: "Temple Core",
    redZoneRadiusMeters: 500,
  },
  VAIGAI_RIVER: {
    name: "Vaigai River (Central)",
    lat: 9.9329,
    lng: 78.1198,
    zone: "Vaigai Riverfront",
    redZoneRadiusMeters: 500,
  },
  THIRUMALAI_NAYAK_PALACE: {
    name: "Thirumalai Nayak Palace",
    lat: 9.9149,
    lng: 78.1249,
    zone: "Heritage Site",
    redZoneRadiusMeters: 300,
  },
  KOODAL_AZHAGAR_TEMPLE: {
    name: "Koodal Azhagar Temple",
    lat: 9.9175,
    lng: 78.1152,
    zone: "Temple Zone",
    redZoneRadiusMeters: 300,
  },
};

/**
 * Ward metadata for Madurai Municipal Corporation.
 * Population density guides baseline risk scoring.
 */
const WARDS = {
  1: { name: "Meenakshi Temple", population: 18000 },
  2: { name: "Bazaar Area", population: 22000 },
  3: { name: "Mattuthavani", population: 15000 },
  4: { name: "Anna Nagar", population: 25000 },
  12: { name: "Tamukkam", population: 20000 },
  15: { name: "Vilachery", population: 17000 },
  20: { name: "KK Nagar", population: 30000 },
};

/**
 * Tamil Nadu festival calendar — high-risk periods for waste generation.
 * Each festival entry has a month (1-indexed) and approximate day window.
 */
const FESTIVAL_CALENDAR = [
  { name: "Chitirai Festival", monthStart: 4, dayStart: 1, dayEnd: 15, wasteMultiplier: 2.8 },
  { name: "Aadi Perukku", monthStart: 8, dayStart: 1, dayEnd: 3, wasteMultiplier: 1.9 },
  { name: "Navaratri", monthStart: 10, dayStart: 1, dayEnd: 10, wasteMultiplier: 2.2 },
  { name: "Karthigai Deepam", monthStart: 11, dayStart: 20, dayEnd: 22, wasteMultiplier: 2.0 },
  { name: "Thai Pongal", monthStart: 1, dayStart: 13, dayEnd: 16, wasteMultiplier: 2.5 },
  { name: "Diwali", monthStart: 11, dayStart: 1, dayEnd: 3, wasteMultiplier: 2.3 },
];

/** Madurai Tamil dialect → English complaint category mappings. */
const TAMIL_COMPLAINT_KEYWORDS = {
  // Odor/Hygiene
  naaruthu: "Bad Odor / Hygiene Issue",
  naarattam: "Bad Odor / Hygiene Issue",
  "臭い": "Bad Odor / Hygiene Issue",
  // Garbage / Trash
  kuppai: "Garbage Accumulation",
  thooimai: "Request for Cleaning",
  // Water / Drainage
  thanneer: "Water Stagnation",
  kazhivadai: "Drainage Blockage",
  cuvara: "Sewage Overflow",
  // Animal
  nai: "Stray Animal",
  "prandhi": "Dead Animal / Hazardous",
  // Specific waste
  "thengai": "Coconut Waste",
  "poo": "Flower Waste (Temple)",
  "vazhai": "Banana Leaf Waste (Temple)",
};

module.exports = {
  LANDMARKS,
  WARDS,
  FESTIVAL_CALENDAR,
  TAMIL_COMPLAINT_KEYWORDS,
};
