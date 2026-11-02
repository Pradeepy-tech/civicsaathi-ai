# CivicSaathi AI — Multilingual Citizen Grievance Platform

**Your Voice. Your Language. Your Solution.**

CivicSaathi AI is a full-stack, multilingual citizen grievance submission, smart municipal ward routing, private tracking, and RBAC officer resolution web application built for Indian municipal contexts (**New Delhi MCD**, **Pune PMC**, and **Bengaluru BBMP**).

---

## 1. Feature Matrix & Transparency Disclosure

To maintain strict engineering transparency, features are categorized clearly below:

### Working End-to-End Features
- **Bilingual UI (`English` & `हिन्दी`) + Regional Input**: Citizens can switch interface copy between English and Hindi, and submit grievances in **Hindi, Hinglish, English, Marathi, Punjabi, Tamil, Bengali, and Telugu**.
- **Server-Side AI Voice Transcription**: Browser microphone recordings are sent securely to the backend (`/api/ai/transcribe` using `gemini-3.5-transcribe`) without exposing any API keys in client code.
- **Multilingual AI Triage & Rule-Based Fallback**: Server-side NLP (`/api/ai/classify` using `gemini-3.8-flash`) extracts category, bilingual summaries, location clues, follow-up questions for vague reports, and urgency priority. If AI credentials are unavailable, a deterministic multilingual rule-based classifier runs automatically and labels the result **`Automated Rule-Based Classification`**.
- **Smart Locality-to-Ward Routing**: Maps verified localities across New Delhi, Pune, and Bengaluru to configured municipal wards, departments, and priority SLA deadlines (`Critical: 6h`, `High: 24h`, `Medium: 72h`, `Low: 120h`), flagging unlisted or ambiguous cases as **`Manual Assignment Required`**.
- **Duplicate Complaint Clustering**: Identifies active grievances in the same city/ward/category and lets citizens link their report to an existing neighborhood cluster while still issuing their own independent **Complaint ID** and **PIN**.
- **Guest Privacy via Hashed Access PIN**: Citizens receive a unique Complaint ID (e.g., `CS-DEL-2026-4812`) and 4-digit secret PIN (salted SHA-256 hash stored in PostgreSQL). Private citizen complaints are never exposed publicly and cannot be accessed without matching credentials.
- **Before-and-After Photo Evidence & Citizen Resolution Verification**: Citizens attach optional pre-repair photos; officers attach post-repair photos when marking a ticket `Resolved`. Citizens unlock their ticket to **Confirm Resolution** (with 1–5 star rating) or **Report Problem Unresolved** (reopening and escalating the ticket to `In Progress`).
- **Automatic Overdue SLA Escalation**: Overdue `Pending` and `In Progress` tickets automatically escalate (`is_escalated = true`) and record audit entries in `status_history`.
- **Authenticated Officer & Admin Dashboard (Google Sign-In + RBAC)**: Secured via Firebase Google Authentication and server-side Firebase Admin ID token verification. Department Officers only access complaints routed to their authorized department, while Nodal Super Admins oversee all departments, analytics charts, and officer role assignments.

### Simulated / Prototype-Scoped Features
- **Government Portal Submission**: CivicSaathi AI is a standalone civic-tech prototype. Complaints are persisted in the application's Cloud SQL PostgreSQL database and are **not** transmitted to external municipal government portals.
- **Citizen SMS / Email Dispatch**: Status transitions and escalations are recorded in the persistent `notifications` audit ledger and displayed inside the Citizen Tracker. External SMS/email gateway delivery is marked `logged_no_external_provider` unless an external provider webhook is integrated.

---

## 2. Architecture & Database Schema

- **Primary AI / ML Engine (`Python 3.10+` — `ai_engine/`)**:
  - **`MultilingualCivicNaiveBayes`** (`ai_engine/ml_models.py`): Multinomial Naive Bayes text classifier with Laplace smoothing, word unigrams/bigrams, character 3/4-grams, and multilingual domain priors across 12 civic categories (English, Hindi, Hinglish, Marathi, Punjabi, Tamil, Bengali, Telugu).
  - **`CivicSeverityScorer`** (`ai_engine/ml_models.py`): Hybrid deterministic municipal safety hazard rules (`Critical` Rules #1–#4) + feature-weighted linear urgency scorer.
  - **`SublinearTfidfBm25DuplicateRanker`** (`ai_engine/ml_models.py`): Sublinear TF-IDF (`1 + log(tf)`) cosine similarity + Okapi BM25 (`k1=1.5, b=0.75`) + lexical Jaccard duplicate complaint ranker.
  - **Server-Side Gemini & STT Orchestration** (`ai_engine/gemini_client.py`, `ai_engine/pipelines.py`): Python REST/SSE orchestration for `gemini-3.8-flash` (`thinkingLevel: "LOW"`), `gemini-3.1-flash-lite`, and `gemini-3.5-transcribe` over persistent zero-port stdio NDJSON IPC (`ai_engine/worker.py`).
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **API Gateway**: Node.js + Express (`server.ts`), Rate Limiting, Input Sanitization, Python IPC Bridge (`src/server/pythonMlBridge.ts`)
- **Database**: Managed **Cloud SQL (PostgreSQL)** via **Drizzle ORM** (`src/db/schema.ts`) across 9 normalized tables:
  1. `users` (Officer/Admin profiles & RBAC scopes)
  2. `departments` (8 municipal wings + priority SLA hours)
  3. `wards` (Verified All-India multi-city municipal wards)
  4. `complaints` (Grievances, hashed PINs, routing, duplicate links, SLA deadlines)
  5. `complaint_assignments` (Auto & manual assignment audit log)
  6. `status_history` (Chronological status & escalation timeline)
  7. `notifications` (Citizen alert ledger)
  8. `resolution_feedback` (Citizen confirmation ratings & reopen reasons)
  9. `uploaded_evidence` (Validated before, after, and reopen photographs)
- **Authentication**: Firebase Authentication (`signInWithPopup` Google OAuth) + `firebase-admin` token verification middleware

---

## 3. Setup & Local / Cloud Run Deployment

1. Copy `.env.example` to `.env` and populate environment variables:
   - `GEMINI_API_KEY`: Server-side Gemini API key (configured via Secrets in AI Studio).
   - `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`: Provisioned automatically by Cloud SQL setup.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start development server (Express + Vite middleware on port 3000):
   ```bash
   npm run dev
   ```
4. Build and run for production:
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```

---

## 4. End-to-End Testing Guide & Fictional Sample Data

### Pre-Seeded Fictional Sample Tickets (Clearly Labeled Demo Data)
| Complaint ID | Demo PIN | City & Locality | Language | Scenario Covered |
| :--- | :--- | :--- | :--- | :--- |
| `CS-DEL-2026-1001` | `1122` | New Delhi · Ajmal Khan Road | Hinglish | Critical water pipe burst, **Overdue Auto-Escalated**, includes Before photo |
| `CS-BLR-2026-1002` | `2233` | Bengaluru · HAL 2nd Stage | English | **`Resolved` with Before & After photos** — ready to test Citizen Verification! |
| `CS-PUN-2026-1003` | `3344` | Pune · Kothrud Depot | Marathi | Critical uncovered manhole near school (`Safety Rule #1`), `In Progress` |
| `CS-DEL-2026-1004` | `4455` | New Delhi · Ajmal Khan Road | Hindi | **Linked Duplicate** grouped under `CS-DEL-2026-1001` |
| `CS-BLR-2026-1005` | `5566` | Bengaluru · 80 Feet Road | Tamil | Streetlight feeder outage, `In Progress` |
| `CS-PUN-2026-1006` | `6677` | Pune · Shivajinagar | Hindi | Rule-based fallback + **`Manual Assignment Required`** |

### Recommended 7-Step Evaluation Flow
1. **Submit in Hindi or Hinglish**: Open **Submit Complaint**, pick `Hindi` or `Hinglish` (click *Insert Sample Phrase* or record voice), choose `New Delhi` → `Ajmal Khan Road`, enter your name, and click **Analyze & Preview Department Routing**.
2. **Verify AI Triage & Duplicate Detection**: Inspect the interpreted summary, `Water Supply` category, `Critical` priority rule, mapped ward (`Karol Bagh Central`), and notice the **Duplicate Complaint Detection** prompt matching `CS-DEL-2026-1001`.
3. **Confirm & Register**: Check the confirmation box and click **Confirm & Submit Grievance**. Copy your generated **Complaint ID** and **4-Digit PIN**.
4. **Officer Login & RBAC**: Open **Officer Dashboard** and sign in with Google. Use the **RBAC Scope** selector in the header to test switching between `Super Admin (All Departments)` and `Officer — WATER Only` to observe server-enforced department isolation.
5. **Update Status**: Select your newly submitted complaint, set status to `Resolved` (optionally attach an "After" photo), add an official remark, and click **Save Official Update**.
6. **Private Citizen Tracking**: Open **Track Complaint**, enter your **Complaint ID** and **PIN** (try an incorrect PIN first to confirm `403` privacy protection), and inspect the timestamped status timeline.
7. **Citizen Resolution Verification**: In the unlocked resolved view, submit **Confirm Issue Resolved** (with star rating) or **Report Problem Unresolved** to verify live ticket reopening and escalation.
