# CivicSaathi AI — Multilingual Citizen Grievance Platform

CivicSaathi AI is a bilingual (Hindi & English) civic grievance platform enabling Indian citizens to report neighborhood infrastructure issues via regional text, Hinglish, or voice, automatically classifying and routing complaints to municipal ward departments while equipping authorized officers with real-time SLA tracking, duplicate clustering, and resolution verification.

## User Review & Critical Decisions

> [!IMPORTANT]
> Upon approving this plan, the platform will prompt you via the **Cloud SQL Setup** confirmation card to provision your managed PostgreSQL instance and enable **Google Sign-In** for Officer Dashboard access. No database resources are created until you confirm that prompt.

- **Confirmed — Database & Officer Auth**: Managed **Cloud SQL (PostgreSQL)** via relational schema migrations paired with **Google Sign-In** for authenticated, role-based Officer Dashboard access. The project owner account is automatically bootstrapped as a Municipal Super Admin capable of managing officer department assignments for instant end-to-end testing.
- **Confirmed — Citizen Submission & Privacy**: **Guest submission with Tracking ID + Secret 4-Digit PIN**. Citizens do not need an account to file a grievance; sensitive details, uploaded photos, and resolution verification actions are protected behind their unique Complaint ID and hashed PIN so private complaints belonging to other citizens are never exposed.
- **Confirmed — Multilingual UI & Voice Input**: Full **English / हिन्दी (Hindi)** interface toggle, accepting written or spoken grievances in Hindi, English, Hinglish, Punjabi, Tamil, Bengali, Telugu, and Marathi, powered by server-side AI audio transcription and structured NLP classification (with a clearly labeled rule-based fallback).
- **Confirmed — Municipal Ward Context**: Pre-configured verified localities, municipal wards, and configurable department routing rules across **New Delhi (MCD)**, **Pune (PMC)**, and **Bengaluru (BBMP)**, seeded with clearly labeled fictional sample complaints.

> [!NOTE]
> **Prototype Transparency**: CivicSaathi AI clearly labels itself as a civic-tech prototype. Department routing uses configurable local ward-to-department mappings rather than claiming live submission to external government portals, and citizen status alerts log to an auditable notification ledger ready for external SMS/email providers.

---

## 1. Overview & Core Concept

- **What It Does**: Bridges the language and bureaucratic gap between citizens and municipal corporations. Citizens describe civic problems naturally—by typing in regional script, Hinglish, or speaking into their microphone—review an AI-interpreted summary and proposed municipal department, receive a private Tracking ID + PIN, and verify the fix with before-and-after evidence once resolved.
- **Target Audience / Personas**:
  - **Citizens**: Residents across urban wards seeking a fast, accessible way to report water leaks, potholes, uncollected garbage, streetlight outages, or safety hazards in their native tongue without navigating complex departmental forms.
  - **Ward & Department Officers**: Municipal engineers and sanitation supervisors who need prioritized queues, duplicate cluster visibility, SLA countdowns, and structured status workflows restricted to their authorized department.
  - **Municipal Super Admins**: Nodal administrators overseeing cross-city SLA compliance, overdue escalations, routing configurations, and officer role assignments.
- **Key Value**: Eliminates misrouted complaints and opaque "resolved" closures through pre-submission AI triage, locality-to-ward auto-routing, duplicate grouping, automatic overdue escalation, and citizen-confirmed resolution verification.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Landing & Civic Trust Experience (`Home`)**:
   - Opens with the headline **"Your Voice. Your Language. Your Solution."** in both English and Hindi depending on the active language toggle, accompanied by a primary action to file a grievance and a quick-lookup bar to track an existing Complaint ID.
   - Showcases how multilingual triage, smart ward routing, and citizen resolution verification work, alongside anonymized public resolution metrics and clearly labeled sample case studies across Delhi, Pune, and Bengaluru.
2. **Guided Multilingual Submission (`Submit Complaint`)**:
   - **Step 1 — Input & Evidence**: Citizen selects their preferred input language (Hindi, English, Hinglish, Punjabi, Tamil, Bengali, Telugu, Marathi), speaks via the browser microphone (transcribed server-side) or types their issue, selects City and Verified Locality (auto-resolving the Municipal Ward), optionally attaches a "Before" photo, and enters minimal contact info.
   - **Step 2 — AI Triage, Follow-Up & Duplicate Check**: Server-side AI analyzes meaning, extracts missing location/severity context (prompting brief follow-up questions if critical details like landmark or hazard scope are missing), assigns one of the 8 civic categories, evaluates urgency (`Critical`, `High`, `Medium`, `Low`) using transparent rules, recommends the responsible municipal department (or flags `Manual Assignment Required`), and surfaces any active **Duplicate Complaints** in the same locality so the citizen can link their report while still receiving their own independent Complaint ID.
   - **Step 3 — Citizen Confirmation & Receipt**: Citizen reviews the plain-language interpreted summary, ward, urgency, and routed department (clearly labeled as AI-classified or Automated Rule-Based Fallback), confirms submission, and receives a downloadable/copyable **Complaint ID** (e.g., `CS-DEL-2026-4819`) + **4-Digit Secret PIN**.
3. **Private Complaint Tracking & Resolution Verification (`Track Complaint`)**:
   - Entering a Complaint ID + PIN unlocks the grievance timeline: current status (`Pending`, `In Progress`, `Resolved`, `Rejected`), assigned department, expected SLA response deadline, timestamped status history, notification log, and uploaded before/after photos.
   - Also provides a clearly labeled **Demo Quick-Fill Drawer** listing fictional sample Complaint IDs and PINs so evaluators can test tracking and verification in one click.
   - When status is `Resolved`, the citizen sees the officer's resolution notes and "After" photo and can either **Confirm Resolution** (recording satisfaction feedback) or **Report Still Unresolved** (attaching optional proof to reopen and escalate the ticket).
4. **Authenticated Officer & Admin Workspace (`Officer Dashboard`)**:
   - Officers sign in with **Google Sign-In**. Role-based access control restricts department officers strictly to complaints routed to their authorized department/city, while Municipal Super Admins can view all departments, configure routing/officer roles, and assign manual-routing tickets.
   - Features KPI summary strip (Total, Pending, In Progress, Resolved, Overdue), multi-dimensional filters (Category, City/Locality/Ward, Department, Status, Date, Priority), overdue **Escalation Alerts**, interactive trend & SLA resolution charts, and a detailed **Complaint Action Drawer** for updating status with mandatory remarks, uploading "After" resolution photos, and inspecting grouped duplicate reports.

### Visual Identity & Theme

- **Aesthetic Direction**: *Institutional Civic Modernism*—authoritative, calm, high-contrast government technology inspired by leading national digital public infrastructure portals, free of decorative clutter.
- **Color Palette & Mood (60-30-10 Allocation)**:
  - **60% Dominant Neutral Canvas (`--background`)**: Crisp cool alabaster (`#F8FAFC`) and pure white (`#FFFFFF`) structural workspaces for effortless daylight readability on mobile and desktop.
  - **30% Structural Surfaces (`--primary` / `--muted`)**: Deep Ashoka Navy (`#0F172A`) for institutional headers, primary typography, and table anchors, paired with subtle slate hairlines (`#E2E8F0`) and muted slate prose (`#475569`).
  - **10% Civic Accent Budget (`--accent`)**:Measured Civic Saffron (`#D97706` / `#EA580C`) reserved strictly for primary call-to-action buttons and active focus states, paired with semantic India Emerald (`#15803D`) for verified resolutions and Crimson (`#DC2626`) for overdue SLA escalations. Every status state pairs color with an explicit icon and bilingual text label for color-blind accessibility.
- **Typography & Hierarchy**:
  - **Display & Headings**: `Plus Jakarta Sans` (SemiBold/Bold, tight tracking, balanced headline wrapping) for commanding hero presence and clean section hierarchy.
  - **Body & Multilingual Copy**: `Public Sans` paired with `Noto Sans Devanagari` for crisp, high-legibility English and Hindi script at `15px–16px` with generous line height.
  - **Tabular Metrics & Identifiers**: `IBM Plex Mono` (`tabular-nums`) strictly applied to Complaint IDs, ward codes, SLA countdowns, timestamps, and dashboard KPI counters.
- **Component Styling & Layout**:
  - **Top Bar Contract**: Strict single-row, three-zone header (`CivicSaathi AI` wordmark — `Home`, `Submit Complaint`, `Track Complaint`, `Officer Dashboard` text links — single `File Grievance` primary CTA). Secondary workspace controls (such as the `English / हिन्दी` language toggle and prototype notice) live in a quiet utility strip immediately below the header.
  - **Single-Elevation Surfaces**: Flat cards and high-density `40px` officer data tables bounded by `1px` slate hairlines without nested card boxes or thick colored left borders. Metadata (locality, ward, date, classification source) renders as clean inline text separated by `·`.
- **Interactive Feedback & Motion**:
  - Fast `150ms` compositor-only transitions on drawers, filter tabs, and step progressions; skeleton loading rows matching table geometry; real-time waveform/timer indicator during voice recording; accessible toast notifications on submission, status updates, and PIN verification errors.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Guest Complaint ID + Hashed PIN vs. Mandatory Citizen Accounts**
  - *Chosen Approach*: Frictionless guest submission protected by a server-generated unique Complaint ID and 4-digit secret PIN (hashed at rest), paired with Google Sign-In strictly for Municipal Officers and Admins.
  - *Why*: Requiring citizens—especially first-time or regional-language users reporting urgent street hazards—to register an account causes high drop-off, while a hashed PIN guarantees private complaints and contact details cannot be enumerated or viewed by other citizens.
  - *Alternatives Considered*: Publicly readable tracking by ID alone (rejected due to privacy exposure of citizen descriptions/photos) or mandatory OAuth for citizens (rejected per confirmed user preference for low-friction guest access).
- **Decision 2: Hybrid AI Triage with Deterministic Rule Fallback & Priority Engine**
  - *Chosen Approach*: Server-side multimodal/multilingual NLP extracts category, translation, missing-info follow-ups, and urgency cues, combined with a deterministic rule engine for safety-critical keywords (e.g., open manhole, live electrical wire, major pipeline burst) and full rule-based classification fallback if the AI service is unreachable.
  - *Why*: Guarantees 100% uptime during live demonstrations while making classification provenance (`AI Multilingual Analysis` vs. `Automated Rule-Based Classification`) completely transparent to citizens and officers.
  - *Alternatives Considered*: Relying solely on LLM output without deterministic urgency rules (rejected because life-safety civic hazards require predictable, auditable SLA escalation).
- **Decision 3: Cluster-Linked Duplicate Detection Preserving Individual IDs**
  - *Chosen Approach*: Similarity matching across active complaints in the same city/ward/category suggests linking a new report to an existing primary issue while still issuing the citizen their own Complaint ID, PIN, and status history.
  - *Why*: Prevents citizens from feeling dismissed when reporting a widely affecting outage, while allowing officers to see consolidated citizen impact counts and update status cleanly.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        CLIENT WORKSPACE (React + Tailwind)                   │
│                                                                              │
│  ┌────────────────┐  ┌────────────────────┐  ┌────────────────────────────┐  │
│  │  Landing View  │  │ Grievance Wizard   │  │ Private Tracker &          │  │
│  │  • Bilingual   │  │ • Language/Voice   │  │ Resolution Verifier        │  │
│  │    Hero & KPIs │  │ • AI Triage Review │  │ • ID + PIN Gate            │  │
│  │  • Sample Demo │  │ • Duplicate Notice │  │ • Timeline & Before/After  │  │
│  │    Showcase    │  │ • Follow-up Prompt │  │ • Confirm / Reopen Flow    │  │
│  └───────┬────────┘  └─────────┬──────────┘  └─────────────┬──────────────┘  │
│          │                     │                           │                 │
│  ┌───────┴─────────────────────┴───────────────────────────┴──────────────┐  │
│  │                 Authenticated Officer & Admin Console                  │  │
│  │  • Google Sign-In Gate   • KPI & Escalation Strip   • Trend Charts     │  │
│  │  • Multi-Filter Queue    • Assignment & RBAC        • Status Drawer    │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       │ HTTPS JSON / Multipart Base64
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     BACKEND API SERVER (Node + Express)                      │
│                                                                              │
│  ┌────────────────────────┐  ┌─────────────────────┐  ┌───────────────────┐  │
│  │ Security & Guardrails  │  │ AI & Voice Service  │  │ Smart Routing &   │  │
│  │ • Rate Limiter         │  │ • Audio Transcribe  │  │ SLA Engine        │  │
│  │ • Input Sanitizer      │  │   (gemini-3.5-      │  │ • Locality → Ward │  │
│  │ • PIN Hash Verifier    │  │    transcribe)      │  │ • Dept Mapping    │  │
│  │ • Firebase Admin Token │  │ • NLP Triage JSON   │  │ • Duplicate Match │  │
│  │   & RBAC Middleware    │  │   (gemini-3.8-flash)│  │ • Auto-Escalation │  │
│  │                        │  │ • Rule Fallback     │  │   Evaluator       │  │
│  └───────────┬────────────┘  └──────────┬──────────┘  └─────────┬─────────┘  │
└──────────────┼──────────────────────────┼───────────────────────┼────────────┘
               │                          │                       │
               ▼                          ▼                       ▼
┌──────────────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│   Cloud SQL (PostgreSQL)     │  │  Gemini GenAI    │  │ Firebase Auth        │
│   Managed via Drizzle ORM    │  │  Server-Side SDK │  │ (Google OAuth Popup) │
│   • 9 Normalized Tables      │  │  (API Key Safe)  │  │ Officer Identity     │
└──────────────────────────────┘  └──────────────────┘  └──────────────────────┘
```

### Data Model & Relational Entities

All persistent state resides in **Cloud SQL (PostgreSQL)** managed through type-safe ORM definitions across nine relational entities:

1. **Users (`users`)**: Stores officer and admin profiles keyed by Firebase Auth `uid`, email, display name, role (`super_admin`, `department_officer`), authorized `department_id`, and city scope.
2. **Departments (`departments`)**: Configurable municipal departments (Water Supply, Electricity, Roads/PWD, Municipal Sanitation, Municipal Electrical/Streetlights, Drainage & Sewage, Public Safety, General Civic Administration) with bilingual names and SLA target hours per priority tier.
3. **Wards & Locality Mappings (`wards`)**: Verified localities mapped to municipal corporations (`New Delhi - MCD`, `Pune - PMC`, `Bengaluru - BBMP`), ward numbers, ward names, and optional local department overrides.
4. **Complaints (`complaints`)**: Core grievance record storing public `tracking_code`, salted/hashed `access_pin_hash`, submitted `language`, `raw_description`, `english_summary`, `category`, `priority` (`Critical`, `High`, `Medium`, `Low`), `priority_reason`, `classification_mode` (`ai` or `rule_fallback`), `city`, `ward_id`, `locality`, `landmark`, citizen contact fields (kept private), `assigned_department_id`, `requires_manual_assignment`, `duplicate_of_id` (preserving each citizen's unique ID while linking clusters), `status` (`Pending`, `In Progress`, `Resolved`, `Rejected`), `sla_deadline`, `is_escalated`, `is_sample_demo`, and timestamps.
5. **Complaint Assignments (`complaint_assignments`)**: Audit trail of automated and manual routing assignments linking complaints to departments and officers with assignment notes.
6. **Status History (`status_history`)**: Immutable chronological log of every status transition, actor role/label, bilingual status badge, escalation event, and officer/citizen remark.
7. **Notifications (`notifications`)**: Records citizen alert events triggered on registration, assignment, escalation, and status updates, clearly marking simulated delivery vs. configured webhook/SMS providers.
8. **Resolution Feedback (`resolution_feedback`)**: Captures citizen verification outcomes (`confirmed` or `reopened`), 1–5 rating, and verification remarks.
9. **Uploaded Evidence (`uploaded_evidence`)**: Stores validated image attachments (`submission_before`, `resolution_after`, `reopen_proof`) with MIME/size bounds and ownership metadata, served only to the PIN-verified citizen or authorized department officer.

### Interactive Component & State Mapping

- **Voice & Multilingual Triage Handler**: Captures browser `MediaRecorder` audio blobs, posts to the server transcription endpoint (`gemini-3.5-transcribe`), populates the editable complaint textarea so the citizen can review/amend text, and invokes the triage endpoint (`gemini-3.8-flash` with strict `responseSchema`). If the AI detects missing location or hazard specifics, the UI renders inline follow-up inputs before advancing; if the AI API errors or lacks quota, the backend seamlessly executes the deterministic multilingual keyword classifier and returns `classificationMode: "rule_fallback"`.
- **Duplicate Cluster & Confirmation Gate**: During triage preview, queries active complaints in the same ward/locality and category using token overlap; displays matching public summaries (`tracking_code`, locality, reported date) so the citizen can opt into linking (`duplicate_of_id`) or file standalone, then commits the record only upon explicit citizen confirmation.
- **SLA Auto-Escalation & Officer Queue**: On dashboard load and complaint queries, evaluates `now > sla_deadline` for unresolved complaints, automatically setting `is_escalated = true` and appending an escalation entry in `status_history` if not yet flagged. Filter controls, search bars, assignment dropdowns, status modals, and Recharts/SVG analytics update live from server state.
- **Citizen Verification Loop**: Unlocking a `Resolved` complaint via Tracking ID + PIN enables two mutually exclusive verification handlers: *Confirm Resolution* (persists `resolution_feedback` and locks verified state) or *Report Unresolved* (accepts reason + optional photo, transitions `complaints.status` back to `In Progress` with `High` priority, and logs a reopen event in `status_history` for the assigned officer).
