AI Mystery Room: Product & Technical
Specification
Version: 1.0 | Status: Draft, source of truth for implementation | Audience: Codex (build
agent) and human reviewers
Rule for the build agent: This document is the single source of truth. If code and spec
disagree, the spec wins. If the spec is silent or ambiguous, choose the simplest option
consistent with this document, record it in DECISIONS.md , and continue. Do not add
features not listed here.
1. Overview
AI Mystery Room is a web app where a player types a short scenario or story seed (for
example: a jewel goes missing during a wedding reception). The backend uses Gemini to
invent a complete fictional investigation with a hidden culprit, then generates an evidence
board: WhatsApp-style chats, images, and CCTV footage. The player studies the
evidence, deduces who did it, and submits an accusation. The app reveals whether they
were right and explains the real solution.
1.1 Goals
Turn any short user prompt into a fair, solvable mystery in under about 90 seconds.
Provide multi-format evidence that feels realistic and contains both clues and red
herrings.
Guarantee that exactly one suspect is the culprit and that the evidence supports a
logical deduction.
Keep the solution hidden from the client until the player submits a final accusation.
1.2 Non-Goals (v1)
No multiplayer, leaderboards, or social features.
No payments or subscriptions.
No mobile native apps (responsive web only).
No user-uploaded evidence.
No real people, real brands in defamatory context, or real crimes. All content is
fictional.
AI Mystery Room: Product & Technical Specification
Page 1 of 15
1.3 Success Criteria
2.Tech Stack
The Gemini API key must only exist on the server. The client never calls Gemini.
Metric Target
Case generation success rate (valid, passes
validation)
at least 95%
Time to playable case under 90 s (text evidence streams first,
media may finish later)
Solvability check pass rate before showing a
case
100% (failed cases are regenerated, never
shown)
Layer Choice
Database MongoDB (Atlas or local) with Mongoose ODM
Backend Node.js (LTS 20+), Express.js, JavaScript ES
modules
Frontend React 18 + Vite, React Router, Tailwind CSS
State/data TanStack Query for server state, React context for
auth
AI Google Gemini via the official @google/genai SDK
Validation Zod (shared schemas forAI output and API input)
Auth JWT in httpOnly cookie, bcrypt password hashing
Media storage Local disk in dev ( /uploads ), S3-compatible
bucket in prod (behind a storage adapter)
Testing Vitest (unit), Supertest (API), Playwright (one e2e
happy path)
AI Mystery Room: Product & Technical Specification
Page 2 of 15
2.1Environment Variables
Provide a .env.example containing every variable above.
3. Users and Core Flow
Persona: a casual puzzle or true-crime fan who wants a quick, immersive whodunit.
3.1 Primary User Journey
1. Player registers or logs in (guest play is out of scope for v1).
2. Player lands on Home, enters a scenario (20 to 500 characters), optionally picks
difficulty (Easy, Medium, Hard) and tone (Realistic, Noir, Cozy).
3. Player submits. The app creates a case in generating state and shows a progress
screen with live stage updates.
4. When the case is ready , the player enters the Case Room: case brief, suspect list, and
the evidence board.
5. Player opens and reviews evidence, may take private notes, and may request up to 3
hints.
Name Purpose
PORT API port (default 5000)
MONGODB_URI Mongo connection string
JWT_SECRET Cookie signing secret
CLIENT_ORIGIN CORS allowed origin
GEMINI_API_KEY Gemini key (server only)
GEMINI_TEXT_MODEL Model for blueprint, chats, validation (configurable,
never hardcoded)
GEMINI_IMAGE_MODEL Model for image generation (configurable)
GEMINI_VIDEO_MODEL Optional, only used if ENABLE_VIDEO=true
ENABLE_VIDEO false by default
STORAGE_DRIVER local or s3
RATE_LIMIT_CASES_PER_DAY Per-user daily case generation cap (default 5)
AI Mystery Room: Product & Technical Specification
Page 3 of 15
6. Player selects one suspect and submits an accusation with a short written reasoning
(optional but encouraged).
7. App shows the Verdict screen: correct or incorrect, the real culprit, motive, method, a
timeline, and which evidence mattered. Score is computed.
8. Player can replay the same case, start a new one, or view history.
3.2 Screens
4. Functional Requirements
Requirement IDs are stable; reference them in commits and tests.
4.1 Auth (FR-AUTH)
FR-AUTH-1: Register with email, display name, password (min 8 chars). Emails are
unique and lowercased.
FR-AUTH-2: Login sets an httpOnly, SameSite=Lax cookie with a 7-day JWT.
FR-AUTH-3: Logout clears the cookie. All /api/cases/* routes require auth.
4.2 Case Creation (FR-CASE)
FR-CASE-1: Accept scenario (20 to 500 chars), difficulty , tone . Reject with 400
and field errors otherwise.
FR-CASE-2: Sanitize the scenario and treat it strictly as untrusted data inside prompts
(see section 7.6).
Screen Route Notes
Landing / Pitch plus CTA
Register / Login /register , /login Email and password
Home / New
Case
/play Scenario form, recent cases
Generating /case/:id/generating Polls status, shows stage checklist
Case Room /case/:id Brief, suspects, evidence tabs, notes, hints,
accuse button
Verdict /case/:id/verdict Only reachable after accusation
History /history Past cases with result and score
AI Mystery Room: Product & Technical Specification
Page 4 of 15
FR-CASE-3: Enforce the per-user daily cap. Over cap returns 429 with a clear message.
FR-CASE-4: Creation returns immediately with caseId and status generating .
Generation runs asynchronously in a background job (in-process queue is acceptable
for v1).
FR-CASE-5: Case status values: generating , ready , failed , solved ,
failed_accusation is NOT a status; see result in section 5.3.
FR-CASE-6: If generation fails after retries, status is failed with a user-friendly error
and the daily quota is refunded.
4.3Evidence (FR-EVID)
Every case must contain at minimum:
FR-EVID-1: Chat evidence renders in a WhatsApp-like UI: bubbles, sender names,
timestamps, optional read ticks. Data is structured JSON, not an image.
FR-EVID-2: Image evidence is generated by Gemini image generation using a prompt
derived from the blueprint. Each image has a caption and a foundAt timestamp or
location.
FR-EVID-3: CCTV evidence in v1 is a keyframe sequence: 3 to 6 generated images in a
consistent grainy, fixed-camera style, played as a slideshow with a timestamp and
camera ID overlay rendered by the frontend (never baked into the image, to avoid text
errors). If ENABLE_VIDEO=true , generate a short clip instead and fall back to keyframes
on failure.
FR-EVID-4: Each evidence item has a clueRefs array internally linking it to blueprint
clues. This field is never sent to the client before the verdict.
FR-EVID-5: Media generation runs in parallel with a concurrency limit of 3. If an
individual image fails twice, replace it with a styled placeholder card, mark
mediaStatus: failed , and do not fail the case unless fewer than the minimum counts
remain.
Type Minimum count Description
chat 2 conversations WhatsApp-style threads between 2 or more
characters, 8 to 25 messages each
image 3 Scene photos, objects, screenshots, receipts,
documents
cctv 2 Surveillance clips or frame sequences with
timestamp overlay
document 1 (optional) Police note, receipt, email, as styled text
AI Mystery Room: Product & Technical Specification
Page 5 of 15
FR-EVID-6: Case becomes ready as soon as all text evidence is done and at least the
minimum media is available. Remaining media may continue loading; the UI shows
skeletons and polls.
4.4 Gameplay (FR-PLAY)
FR-PLAY-1: The Case Room shows: title, setting, victim or incident summary, 4 to 6
suspects (name, role, short bio, relationship to the incident, portrait image), and the
evidence list grouped by type.
FR-PLAY-2: The player can mark evidence as viewed and pin items to a personal board.
Persisted per user and case.
FR-PLAY-3: Private notes (plain text, 5,000 chars max) autosave with debounce.
FR-PLAY-4: Hints: max 3 per case. Each hint is pre-generated in the blueprint, ordered
from vague to specific, and must never name the culprit. Using hints reduces score.
FR-PLAY-5: Accusation: player selects exactly one suspect and optionally provides
reasoning (max 1,000 chars). One accusation per case attempt. It is final.
FR-PLAY-6: After accusing, the case becomes locked for further accusations. A Replay
action creates a fresh attempt on the same case (new attempt record) with the
solution hidden again.
4.5 Verdict and Scoring (FR-SCORE)
FR-SCORE-1: Verdict reveals: culprit, motive, method, opportunity, full timeline, and
the key clues mapped to the evidence items that proved them, plus red herrings
explained.
FR-SCORE-2: Score (0 to 1000) is computed on the server:
Correct culprit: 600 base, else 0
Time bonus: up to 200, decaying linearly over 30 minutes
Hint penalty: minus 50 per hint used (floor at 0 for this component)
Evidence coverage bonus: up to 200 based on the share of evidence items viewed
FR-SCORE-3: Store score, result, time taken, hints used, and the accusation in the
attempt record.
5. Data Model(Mongoose)
All collections use timestamps: true . All IDs are ObjectId. Index notes are required.
AI Mystery Room: Product & Technical Specification
Page 6 of 15
5.1 User
5.2 Case
5.3 Evidence
Field Type Notes
email String unique, lowercase, required
displayName String 2 to 40 chars
passwordHash String bcrypt, select: false
casesCreatedToday Number with quotaResetAt Date for the daily cap
Field Type Notes
owner ObjectId ref
User
index
scenarioInput String original user text
difficulty ,
tone
String enums
status String enum generating , ready , failed
stage String blueprint , evidence_text , evidence_media ,
validation , done
public Object player-safe data: title , setting , brief ,
suspects[] (id, name, role, bio, portraitUrl),
hints count
solution Object private, select: false : culpritId , motive ,
method , opportunity , timeline[] , clues[] ,
redHerrings[] , hints[]
error String user-safe message when failed
generationMeta Object models used, token counts, duration, retries
Field Type Notes
case ObjectId ref Case index
AI Mystery Room: Product & Technical Specification
Page 7 of 15
5.4 Attempt
6. REST API
Base path /api . JSON in and out. Errors use the shape { error: { code, message,
fields? } } . All routes except auth require a valid cookie.
Field Type Notes
type String enum chat , image , cctv , document
title , caption String
content Mixed chat: {participants[], messages[{sender,
text, ts}]} ; image: {url} ; cctv: {frames[{url,
ts}], cameraId} ; document: {markdown}
mediaStatus String enum pending , ready , failed
clueRefs [String] private, select: false
order Number display order
Field Type Notes
case , user ObjectId compound index (user, case)
startedAt , submittedAt Date
viewedEvidence , pinnedEvidence [ObjectId]
notes String
hintsUsed Number 0 to 3
accusedSuspectId String
reasoning String
result String enum pending , correct , incorrect
score Number
Method Path Purpose
POST /auth/register Create user and log in
AI Mystery Room: Product & Technical Specification
Page 8 of 15
Security invariants (must have tests):
1. No endpoint returns solution or clueRefs before submittedAt exists on the
attempt.
2. A user can only read their own cases and attempts (404 on others).
3. accuse is idempotent-safe: a second call returns 409.
Polling interval on the client: every 2 seconds on the Generating screen, stopping on
ready or failed .
7. AI Pipeline (Gemini)
All Gemini calls live in server/src/ai/ . One module per stage. Every call goes through a
shared geminiClient wrapper that handles timeouts (60 s text, 90 s image), retries (max
2 with exponential backoff), and logging of token usage.
Method Path Purpose
POST /auth/login Log in
POST /auth/logout Log out
GET /auth/me Current user
POST /cases Create case (body: scenario, difficulty, tone)
returns { caseId, status }
GET /cases List the user's cases (history)
GET /cases/:id/status Returns { status, stage, progress } for
polling
GET /cases/:id Player-safe case plus evidence list (solution
and clueRefs excluded)
POST /cases/:id/attempts Start or resume the current attempt
PATCH /attempts/:attemptId Update notes, viewed, pinned
POST /attempts/:attemptId/hint Returns next hint, increments hintsUsed ,
403 after 3
POST /attempts/:attemptId/accuse Body: suspectId , reasoning . Returns the
verdict payload
GET /attempts/:attemptId/verdict Verdict, only if submittedAt is set, else 403
AI Mystery Room: Product & Technical Specification
Page 9 of 15
7.1 Principle:Blueprint First
The AI must decide the truth before generating any evidence. Evidence is derived from
the blueprint, never invented independently. This is what keeps clues consistent.
7.2 Stages
7.3 Structured Output
Use Gemini's JSON response mode with a response schema for stages 1, 2, 3, and 5.
Validate every response with Zod. On a parse or validation failure, retry once with the
validation error appended to the prompt, then fail the stage.
7.4 Fairness Rules (encode in the blueprint prompt and re-check in validation)
Exactly one culprit; every suspect has a motive or opportunity so that the culprit is not
obvious by default.
At least 3 independent clues point to the culprit; at least 1 clue is decisive (e.g. a CCTV
timestamp that contradicts an alibi stated in a chat).
Each red herring must be explainable by the verdict without contradiction.
All timestamps across chats, CCTV, and the timeline must be mutually consistent.
# Stage Output
1 Blueprint Structured JSON: title, setting, incident, 4 to 6
suspects (one is the culprit), motive, method,
opportunity, timeline with exact timestamps, 6 to
10 clues, 3 to 5 red herrings, 3 hints
2 Text evidence Chat threads and documents as structured JSON,
each tagged with the clueRefs it carries
3 Media prompts Image and CCTV prompts per evidence item, built
from the blueprint with a fixed style guide
4 Media generation Images via Gemini image model, stored via the
storage adapter
5 Validation A separate Gemini call (a fresh context with no
creative role) acts as a detective: it receives only
the public case plus evidence and must name the
culprit with reasoning.
6 Finalize Case set to ready
AI Mystery Room: Product & Technical Specification
Page 10 of 15
No supernatural solutions and no solutions that depend on information absent from
the evidence.
Difficulty scaling: Easy = 3 strong clues, 1 red herring; Medium = 3 clues of mixed
strength, 3 red herrings; Hard = subtle clues needing cross-referencing, 5 red herrings.
7.5 Validation Gate
The validation stage passes only if the detective model names the correct culprit and
cites at least 2 valid clues. Otherwise the pipeline regenerates from Stage 1 (max 2 full
regenerations). If still failing, the case is set to failed and the quota is refunded. Failedvalidation cases are never shown to players.
7.6 Prompt Safety
The user's scenario is passed inside clearly delimited tags and the system instruction
states that the content is story seed data only, not instructions.
Refuse or neutralize seeds requesting sexual content involving minors, graphic gore,
real named private individuals, hate content, or real-world harm instructions. Return a
422 with a friendly message and suggest a revised prompt. Use Gemini safety settings
at default or stricter.
Generated content must be fictional, with invented names. Images must not depict
real public figures.
Image generation prompts must avoid readable text where accuracy matters; any
necessary text (time, camera ID) is overlaid by the frontend.
7.7 Image Consistency
Suspect portraits and scene images share a style guide string produced in the blueprint
stage (art style, palette, era, location description) and prepended to every image prompt.
CCTV frames use a fixed camera style string (low resolution, high angle, grain,
desaturated) and the same scene description across frames.
8. Frontend Specification
Design language: dark, detective-board aesthetic (dim background, paper textures,
red string accents). Must be fully responsive down to 360 px width.
Case Room layout (desktop): left rail with suspects, center evidence viewer, right
panel with notes and hints. On mobile these become tabs.
AI Mystery Room: Product & Technical Specification
Page 11 of 15
Evidence viewers: ChatViewer (WhatsApp-style), ImageViewer (zoom and lightbox),
CctvPlayer (play, pause, scrub, overlay with timestamp and camera ID),
DocumentViewer .
Generating screen: a stage checklist (Writing the case, Writing chats, Developing
photos, Pulling CCTV, Verifying the case), with a calm animation. On failure it shows
the error and a retry button.
Accuse flow: modal with suspect cards, reasoning textarea, and a confirmation step
stating that the choice is final.
Verdict screen: animated reveal, then a timeline and clue-to-evidence mapping with
links back to each evidence item.
Accessibility: keyboard navigable, alt text from evidence captions, WCAG AA contrast,
reduced-motion respected.
States: every data view needs loading, empty, and error states.
9. Non-Functional Requirements
Area Requirement
Security Helmet, CORS locked to CLIENT_ORIGIN , rate
limiting (express-rate-limit) on auth and case
creation, input validation on every route, no
secrets in the client bundle
Privacy Store only email, name, and gameplay data; provide
account deletion endpoint that removes the user's
cases and attempts
Reliability Generation jobs are resumable: on server start,
cases stuck in generating for more than 10
minutes are marked failed and refunded
Cost control Daily cap per user, max media items per case (8
images plus portraits, 6 CCTV frames), and logging
of estimated cost per case
Observability Structured logs (pino) with a request ID and a case
ID on each AI call
Performance API p95 under 300 ms for non-AI routes; media
served with cache headers
AI Mystery Room: Product & Technical Specification
Page 12 of 15
10. Repository Structure
ai-mystery-room/
SPEC.md (this document)
DECISIONS.md (build agent logs assumptions here)
server/
src/
index.js
config/env.js
routes/ (auth, cases, attempts)
controllers/
models/ (User, Case, Evidence, Attempt)
middleware/ (auth, validate, rateLimit, error)
ai/
geminiClient.js
blueprint.js
textEvidence.js
mediaPrompts.js
mediaGen.js
validate.js
prompts/ (versioned prompt templates)
services/ (caseService, scoringService, quotaService, storage/)
schemas/ (zod)
jobs/ (generationQueue.js)
tests/
client/
src/
pages/ components/ (evidence/, suspects/, layout/)
api/ hooks/ context/ styles/
tests/
.env.example
README.md
11.Build Plan (Milestones)
Build in order. Each milestone must be runnable and tested before the next begins.
Area Requirement
Code quality ESLint plus Prettier, no any -style shortcuts in
schemas, every module has a clear single
responsibility
AI Mystery Room: Product & Technical Specification
Page 13 of 15
1. M1 Foundation: repo scaffold, env loader, Mongo connection, error middleware, lint,
health route.
2. M2 Auth: FR-AUTH-1 to 3 with tests, protected route middleware, client login and
register.
3. M3 Blueprint pipeline: Gemini client, blueprint stage with Zod validation, a CLI script
npm run gen:case that prints a blueprint. Fairness checks in code where possible
(counts, timestamp ordering).
4. M4 Text evidence + Case API: chat and document generation, case creation, status
polling, player-safe serializer (with the secrecy tests from section 6).
5. M5 Media: image generation, storage adapter, CCTV keyframes, placeholder fallback.
6. M6 Validation gate: detective validation, regeneration loop, quota refund.
7. M7 Gameplay UI: Case Room, evidence viewers, notes, pinning, hints.
8. M8 Accusation and verdict: accuse endpoint, scoring, verdict screen, history.
9. M9 Hardening: rate limits, safety filters, stuck-job recovery, e2e test, README.
12. Acceptance Criteria
The project is complete when all of the following are true:
A new user can register, submit a one-sentence scenario, and reach a playable Case
Room without manual intervention.
Each generated case contains at least 2 chats, 3 images, and 2 CCTV sequences, all
rendered correctly.
Inspecting every network response before accusation reveals no solution data and
no clueRefs (verified by automated test).
Submitting the correct suspect yields correct and a score, submitting a wrong
suspect yields incorrect , and a second accusation returns 409.
At least 20 consecutive generated cases pass the validation gate in testing, or are
cleanly rejected and regenerated.
Gemini failures (timeout, malformed JSON, safety block) never crash the server and
always end in ready or a clean failed state with a refunded quota.
Lint and all tests pass; README.md documents setup in under 10 steps.
13. Assumptions and Open Questions
These are assumed for v1 and may be changed by editing this spec (not by the build
agent).
AI Mystery Room: Product & Technical Specification
Page 14 of 15
English-only content.
Email and password auth only; no OAuth.
Video generation is optional and off by default because of cost and latency; CCTV uses
keyframes.
Gemini model names are configured by environment variable because available models
change frequently.
A single-process in-memory job queue is sufficient; move to BullMQ and Redis if
scaling beyond one instance.
Open: whether guests may play one case without registering. Default for v1 is no.
AI Mystery Room: Product & Technical Specification
Page 15 of 15