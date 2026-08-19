# GCP Infrastructure Reference — Atlas Project

## Account and Billing

| Field | Value |
|---|---|
| GCP Account (email) | vish.cmcit@gmail.com |
| Project ID | gen-lang-client-0750006907 |
| Project Name | Atlas Project |
| Active Billing Account | 01D3AF-BAD595-3831C5 — My Billing Account (300 USD free credits) |
| Previous Billing Account | 0116DC-705134-9CAA60 — Atlas Project (unlinked) |

Always use project gen-lang-client-0750006907 for all future builds/deployments to use the 300 USD credits.

### Hosting Plan After Credits Expire

When the 300 USD credits expire, default to the **Always Free tier** (no monthly cost):

- **Compute Engine** — 1 non-preemptible `e2-micro` VM/month in `us-west1`, `us-central1`, or `us-east1` (free by hours, so one VM running all month is covered). After free: ~6–7 USD/mo on-demand.
- **Cloud Run** — ~240,000 vCPU-sec + 450,000 GiB-sec free/mo (~2M requests). After free: pay-as-you-go.
- **Cloud Storage** — 5 GB regional free (US).
- **Networking** — Standard tier outbound free up to 200 GB/mo.
- Note: GPUs/TPUs are never free; free tier is per billing account, not per project.

For the realtime voice loop after credits expire: self-host **LiveKit (Apache 2.0)** SFU on the free e2-micro instead of LiveKit Cloud, keep **Groq Whisper** STT (free tier ~20 RPM / 2,000 RPD) and **GCP Neural2/WaveNet** TTS (free 1M chars/mo). The per-user daily voice cap (see `voice-caps.ts`) protects the budget. Do not pay for Cloud SQL — consider SQLite/D1.

Defer all e2-micro work until the credits run out — build the app on Cloud Run now.

---

## Cloud Run Services

### Admin and Consumer App — atlas-test

| Field | Value |
|---|---|
| Service Name | atlas-test |
| Region | us-central1 |
| Admin Page URL | https://atlas-test-242199914896.us-central1.run.app/admin |
| Consumer App URL | https://atlas-test-242199914896.us-central1.run.app |
| Alt URL | https://atlas-test-a7lioqzhva-uc.a.run.app |
| Max Scale | 20 instances (revision cap: 3) |
| Memory | 1 GiB |
| CPU | 1 vCPU |
| Port | 8080 |

---

## Docker Image Registry

| Field | Value |
|---|---|
| Registry | Artifact Registry |
| Repository | atlas-images |
| Region | us-central1 |
| Full Image Path | us-central1-docker.pkg.dev/gen-lang-client-0750006907/atlas-images/atlas:test |

---

## Database

| Field | Value |
|---|---|
| Type | PostgreSQL (Cloud SQL) |
| Instance | atlas-test-db |
| Connection | gen-lang-client-0750006907:us-central1:atlas-test-db |
| Secret Name | atlas-db-url (loaded via Secret Manager) |

---

## Secrets (via Secret Manager)

| Secret Name | Used For |
|---|---|
| atlas-db-url | DATABASE_URL — PostgreSQL connection string |
| atlas-better-auth-secret | BETTER_AUTH_SECRET — Auth signing key |
| atlas-secret-key | ATLAS_SECRET_KEY |
| atlas-admin-user-ids | ATLAS_ADMIN_USER_IDS — Comma-separated admin user IDs |
| atlas-gemini-api-key | GEMINI_API_KEY |

---

## Deployment Commands

### Build and Push Image
gcloud builds submit --tag us-central1-docker.pkg.dev/gen-lang-client-0750006907/atlas-images/atlas:test --project gen-lang-client-0750006907

### Deploy New Revision to Cloud Run
gcloud run services update atlas-test --image us-central1-docker.pkg.dev/gen-lang-client-0750006907/atlas-images/atlas:test --region us-central1 --project gen-lang-client-0750006907

### Check Service Status
gcloud run services describe atlas-test --region us-central1 --project gen-lang-client-0750006907

### View Logs
gcloud run services logs read atlas-test --region us-central1 --project gen-lang-client-0750006907 --limit 50

---

## Console Links

| Resource | URL |
|---|---|
| Cloud Run Services | https://console.cloud.google.com/run?project=gen-lang-client-0750006907 |
| Artifact Registry | https://console.cloud.google.com/artifacts?project=gen-lang-client-0750006907 |
| Cloud Build History | https://console.cloud.google.com/cloud-build/builds?project=gen-lang-client-0750006907 |
| Billing Reports | https://console.cloud.google.com/billing/01D3AF-BAD595-3831C5/reports |
| Credits and Balance | https://console.cloud.google.com/billing/01D3AF-BAD595-3831C5/credits |
| Secret Manager | https://console.cloud.google.com/security/secret-manager?project=gen-lang-client-0750006907 |
| Cloud SQL | https://console.cloud.google.com/sql/instances?project=gen-lang-client-0750006907 |
