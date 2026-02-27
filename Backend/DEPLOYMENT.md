# Madurai Civic Intelligence System — Deployment Guide

## Prerequisites

- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- Google Cloud project with billing enabled
- `gcloud` CLI authenticated

---

## Step 1 — Firebase Project Setup

```bash
# Login to Firebase
firebase login

# Set your project
firebase use --add
# Select your project from the list

# Or set directly
firebase use your-project-id
```

---

## Step 2 — Enable Required Google Cloud APIs

Run this once in your GCP project:

```bash
PROJECT_ID=your-project-id

gcloud services enable \
  cloudfunctions.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  aiplatform.googleapis.com \
  speech.googleapis.com \
  maps-backend.googleapis.com \
  places-backend.googleapis.com \
  --project=$PROJECT_ID
```

---

## Step 3 — Configure Environment Variables

Firebase Functions environment config:

```bash
cd functions

# Copy the example env file
cp .env.example .env

# Then set each variable using Firebase Functions config:
firebase functions:config:set \
  app.google_cloud_project="your-project-id" \
  app.vertex_ai_location="asia-south1" \
  app.firebase_storage_bucket="your-project-id.appspot.com" \
  app.google_maps_api_key="your-maps-api-key" \
  app.twilio_account_sid="your-twilio-sid" \
  app.twilio_auth_token="your-twilio-token" \
  app.twilio_from_number="+1xxxxxxxxxx" \
  app.sendgrid_api_key="your-sendgrid-key" \
  app.sendgrid_from_email="alerts@madurai-municipal.gov.in" \
  app.zonal_officer_phone="+9194xxxxxxxx" \
  app.zonal_officer_email="officer@madurai-municipal.gov.in"
```

For local development, populate `.env` directly (already gitignored).

---

## Step 4 — Vertex AI Permissions

Grant the Cloud Functions service account access to Vertex AI:

```bash
PROJECT_ID=your-project-id
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/speech.client"
```

---

## Step 5 — Install Dependencies

```bash
cd functions
npm install
```

---

## Step 6 — Seed Firestore (Disposal Units)

```bash
# Download your serviceAccountKey.json from Firebase Console
# Place it in the project root (NOT in functions/)
# Then:

node functions/config/seedFirestore.js
```

---

## Step 7 — Deploy to Firebase

```bash
# Deploy everything (Functions, Firestore rules, Storage rules, Indexes)
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only Firestore rules
firebase deploy --only firestore:rules

# Deploy only indexes
firebase deploy --only firestore:indexes
```

---

## Step 8 — Test Locally (Emulators)

```bash
cd functions
npm run serve
# Emulator UI: http://localhost:4000
# Functions:   http://localhost:5001/your-project/us-central1/api
```

---

## API Endpoints (Production)

Base URL: `https://asia-south1-YOUR_PROJECT_ID.cloudfunctions.net/api`

| Method | Path              | Description                        |
|--------|-------------------|------------------------------------|
| GET    | /health           | Health check                       |
| POST   | /analyze-image    | Waste image analysis               |
| POST   | /analyze-audio    | Tamil audio complaint              |
| POST   | /verify-cleanup   | Before/after cleanup verification  |
| GET    | /predict-risk     | Ward risk prediction (?ward=N)     |
| POST   | /restore-heritage | Heritage wall restoration          |

---

## Sample API Requests

### POST /analyze-image

```json
{
  "imageBase64": "<base64-encoded-image>",
  "mimeType": "image/jpeg",
  "latitude": 9.9196,
  "longitude": 78.1193,
  "wardNumber": 1,
  "reportedBy": "citizen-001"
}
```

### POST /analyze-audio

```json
{
  "audioBase64": "<base64-encoded-audio>",
  "encoding": "LINEAR16",
  "sampleRateHertz": 16000,
  "latitude": 9.9196,
  "longitude": 78.1193,
  "wardNumber": 1
}
```

### POST /verify-cleanup

```json
{
  "complaintId": "uuid-of-complaint",
  "beforeImageBase64": "<base64>",
  "afterImageBase64": "<base64>",
  "mimeType": "image/jpeg",
  "workerId": "worker-001"
}
```

### GET /predict-risk

```
GET /predict-risk?ward=12
```

### POST /restore-heritage

```json
{
  "imageBase64": "<base64-encoded-dirty-wall>",
  "mimeType": "image/jpeg",
  "locationDescription": "Near Meenakshi Temple eastern gopuram",
  "latitude": 9.9196,
  "longitude": 78.1193
}
```

---

## Architecture Notes

- **Gemini 1.5 Pro** handles image analysis (`/analyze-image`) and cleanup verification (`/verify-cleanup`) — complex multimodal tasks.
- **Gemini 1.5 Flash** handles text classification (`/analyze-audio`, `/predict-risk`, hazard notifications) — fast, cost-efficient.
- **Imagen 3** handles heritage visualization (`/restore-heritage`).
- **Google Speech-to-Text** with Tamil language model handles audio transcription.
- **Agentic Workflow** is triggered automatically when hazards are detected — no separate endpoint needed.
- All AI responses are forced to JSON via `responseMimeType: "application/json"`.
- Distance calculations use server-side Haversine formula (no Maps API billing for proximity).
- Google Maps API is only called for reverse geocoding and driving routes.

---

## Firestore Collections

| Collection           | Purpose                              |
|----------------------|--------------------------------------|
| `complaints`         | All citizen complaints               |
| `verifications`      | Proof-of-work cleanup records        |
| `hazardEscalations`  | Hazard agent execution logs          |
| `disposalUnits`      | Specialized waste disposal units     |
| `heritageRestorations` | Imagen restoration job records     |
