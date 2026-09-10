---
# IVP Africa Backend — API Documentation

Version: 1.0
Last updated: 2026-09-10

Overview
- This document describes the public and internal REST endpoints for the IVP Africa backend service. The backend is implemented with NestJS and Prisma and exposes a JSON HTTP API.

Base URL
- Production: https://ivp-backend.onrender.com
- Global API prefix applied by the server: `/api/v1`

Quick notes
- Authentication: JWT Bearer tokens are used for protected endpoints. A token is issued by `POST /api/v1/auth/login`.
- Content-Type: `application/json` for JSON requests. Multipart/form-data used for file uploads (upload module).
- See the `Database schema (Prisma)` section at the end for the full schema.

Common headers
- `Content-Type: application/json`
- `Authorization: Bearer <token>` (required for protected routes)

Error responses
- Errors are returned as JSON. Typical shape:

```json
{
	"statusCode": 400,
	"message": "Validation failed: ...",
	"error": "Bad Request"
}
```

Authentication
- Method: JWT (Bearer). Include `Authorization: Bearer <token>` on protected requests.
- Public endpoints include registration, login, password reset (request/confirm), verify-email, and health check.

Environment & dependencies
- Required services: PostgreSQL (Prisma), SMTP (email), Supabase (file storage), payment provider (e.g., Paystack). Configure via environment variables in the repository's `.env`.
- Run `npm install` and `npx prisma generate` after changes to `prisma/schema.prisma`.

API reference (grouped)

Auth
- POST /api/v1/auth/register/talent
	- Public. Registers a talent user.
	- Body: JSON object with registration fields (email, password, firstName, lastName, ...).
	- Response: created user summary (no password).

- POST /api/v1/auth/register/employer
	- Public. Registers an employer user.
	- Body: JSON (email, password, companyName, ...).

- POST /api/v1/auth/login
	- Public. Returns JWT and user data.
	- Body: { "email": string, "password": string }
	- Response: { "accessToken": string, "user": { ... } }

- POST /api/v1/auth/password-reset/request
	- Public. Request password reset link.
	- Body: { "email": string }

- POST /api/v1/auth/password-reset/confirm
	- Public. Confirm password reset using token.
	- Body: { "token": string, "newPassword": string }

- GET /api/v1/auth/verify-email?token=<token>
	- Public. Verify email by token parameter.

Employer profile
- GET /api/v1/employer/profile
	- Auth required. Returns employer profile.

- PATCH /api/v1/employer/profile
	- Auth required. Partial update of profile.
	- Body: partial fields to update. Returns updated profile.

Jobs
- POST /api/v1/jobs
	- Auth required (employer). Create a job posting.
	- Body example: { "title": "...", "description": "...", "location": "...", "salaryRange": "..." }

- GET /api/v1/jobs/my-postings
	- Auth required. List jobs posted by the authenticated employer.

- PATCH /api/v1/jobs/:id
	- Auth required (owner). Update job data.

- PATCH /api/v1/jobs/:id/close
	- Auth required (owner). Close the job.

- PATCH /api/v1/jobs/:id/fill
	- Auth required (owner). Mark job as filled.

- GET /api/v1/jobs/:id/applicants
	- Auth required (owner). List applicants.

- PATCH /api/v1/jobs/:id/applicants/:applicationId/status
	- Auth required. Update application status.

- PATCH /api/v1/jobs/:id/applicants/:applicationId/shortlist
	- Auth required. Shortlist an applicant.

- PATCH /api/v1/jobs/:id/applicants/:applicationId/reject
	- Auth required. Reject an applicant.

- POST /api/v1/jobs/:id/applicants/:applicationId/interview
	- Auth required. Schedule an interview for an applicant.

- PATCH /api/v1/jobs/interviews/:interviewId/reschedule
	- Auth required. Reschedule an interview.

- PATCH /api/v1/jobs/interviews/:interviewId/cancel
	- Auth required. Cancel an interview.

Applications
- The `applications` module provides endpoints to create and manage job applications. See `src/modules/applications/` for DTOs and exact shapes.

Subscriptions
- GET /api/v1/subscriptions/plans — Public. List subscription plans.
- POST /api/v1/subscriptions/purchase/:planId — Auth required. Purchase a plan.
- Admin-only (role check required):
	- POST /api/v1/subscriptions/admin/plans — Create plan
	- PATCH /api/v1/subscriptions/admin/plans/:id — Update plan
	- PATCH /api/v1/subscriptions/admin/plans/:id/status — Toggle plan status
	- GET /api/v1/subscriptions/admin/employers — List subscribing employers

Payments
- POST /api/v1/payments/initialize
	- Auth required. Initialize payment with provider.
	- Body example: { "amount": number, "currency": "NGN", "metadata": { ... } }
	- Response: provider initialization payload (e.g., authorization URL, reference).

- POST /api/v1/payments/webhook
	- Public endpoint used by payment provider webhooks. Ensure signature verification in implementation.

- GET /api/v1/payments/history
	- Auth required. Retrieve payments for authenticated employer/user.

Messaging
- POST /api/v1/messaging/send
	- Auth required. Send a message to another user.
	- Body: { "toUserId": string, "subject": string, "body": string }

- GET /api/v1/messaging/conversations
	- Auth required. List user conversations.

- GET /api/v1/messaging/conversations/:id/messages
	- Auth required. List messages in a conversation.

- DELETE /api/v1/messaging/conversations/:id
	- Auth required. Delete a conversation (soft-delete behavior in DB).

Health & System
- GET /api/v1/health — Public. Health check endpoint.
- POST /api/v1/system/seed — Likely admin-only. Seed system data used for development/testing.

Admin
- Admin controllers exist under `src/modules/Admin`; operations typically require admin role check. See `src/modules/Admin/admins.controller.ts`.

Uploads / Files
- File uploads use Supabase for storage. See `modules/upload` for upload endpoints and the `SUPABASE_*` environment variables.

Swagger / OpenAPI
- If Swagger is enabled, interactive docs are served at `/api/docs` on the running server. Use the Swagger UI to view full request/response schemas and to test endpoints.

Environment variables (selected)
- `DATABASE_URL` / `DIRECT_URL` — Postgres connection
- `JWT_SECRET` — JWT signing secret
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — SMTP for email delivery
- `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_BUCKET` — Supabase storage
- `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY` — Payment provider credentials

Examples

Create job
Request

POST /api/v1/jobs
Headers: `Authorization: Bearer <token>`

Body

```json
{
	"title": "Frontend Engineer",
	"description": "Job details...",
	"location": "Remote",
	"salaryRange": "1000-2000"
}
```

Response (201)

```json
{
	"id": "uuid",
	"title": "Frontend Engineer",
	"status": "open",
	"postedBy": { "id":"...", "companyName":"..." }
}
```

Initialize payment
Request

POST /api/v1/payments/initialize
Headers: `Authorization: Bearer <token>`

Body

```json
{ "amount": 10000, "currency": "NGN", "metadata": { "purpose": "subscription" } }
```

Response (200)

```json
{ "reference": "...", "authorization_url": "https://payment-provider/..." }
```

Notes & known limitations
- Some controllers are annotated with full paths (`@Controller('api/v1/...')`) in addition to the global prefix, which can produce duplicated routes at runtime (`/api/v1/api/v1/...`).
- `TalentController` exists but may not be registered because its module is not imported in `AppModule`.
- `UsersModule` and `ApplicationsModule` are present but currently contain no controllers.

Rate limits, pagination and validation
- The API implements validation pipes; requests may return 400 on invalid payloads. Pagination and rate-limiting behavior should be checked in each controller (not documented globally).

Next steps (suggested)
- Generate an OpenAPI JSON from NestJS Swagger for a machine-readable spec.
- Add example request/response DTOs per endpoint by inspecting controller DTOs in `src/modules/*/dto`.

## Database schema (Prisma)

The project's Prisma schema (from `prisma/schema.prisma`):

```prisma
generator client {
	provider = "prisma-client-js"
	output   = "../node_modules/.prisma/client"
}

datasource db {
	provider = "postgresql"
}

// --- ENUMS ---

enum Role {
	ADMIN
	TALENT
	EMPLOYER
}

enum VerificationStatus {
	PENDING
	APPROVED
	REJECTED
}

enum AccountStatus {
	ACTIVE
	INACTIVE
	SUSPENDED
}

enum ApplicationStatus {
	PENDING
	REVIEWING
	SHORTLISTED
	ACCEPTED
	REJECTED
}

enum JobStatus {
	DRAFT
	PUBLISHED
	CLOSED
	FILLED
}

enum SubscriptionStatus {
	ACTIVE
	EXPIRED
	CANCELED
}

enum PaymentStatus {
	PENDING
	SUCCESS
	FAILED
}

enum InterviewStatus {
	SCHEDULED
	RESCHEDULED
	CANCELED
	COMPLETED
}

enum NotificationType {
	APPLICATION
	INTERVIEW
	MESSAGE
	SUBSCRIPTION
	SYSTEM
	PAYMENT 
}

// --- CORE MODELS ---
model User {
	id                   String    @id @default(uuid())
	email                String    @unique @db.VarChar(255)
	passwordHash         String
	role                 Role      @default(TALENT)
	isVerified           Boolean   @default(false) // Inactive until verified
	verificationToken    String?
	resetToken           String?
	resetTokenExpiry     DateTime?
	resetPasswordToken   String?
	resetPasswordExpires DateTime?
	createdAt            DateTime  @default(now())
	updatedAt            DateTime  @updatedAt

	status AccountStatus @default(ACTIVE)

	// Admin Auth fields
	adminLoginToken       String?
	adminLoginTokenExpiry DateTime?
	broadcastsSent        BroadcastNotification[]

	talentProfile   TalentProfile?
	employerProfile EmployerProfile?
	auditLogs       AuditLog[]
	notifications      Notification[]
}

model TalentProfile {
	id                String   @id @default(uuid())
	userId            String   @unique
	user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
	firstName         String
	lastName          String
	phoneNumber       String?
	age               Int?
	headline          String?  @db.VarChar(255)
	professionalTitle String?  @db.VarChar(255)
	bio               String?
	location          String?
	jobType           String?
	salary            String?
	skills            String[]
	certifications    String[] @default([])
	resumeUrl         String?

	portfolioUrl String?

	preferredJobType  String? // e.g., "Full-time", "Contract"
	preferredLocation String? // e.g., "Remote", "On-site"
	expectedSalary    String?
	availability      String? // e.g., "Immediate", "2 Weeks"
	profileImageUrl   String?

	profilePercent Int            @default(0)
	conversations  Conversation[]

	applications   Application[]
	workExperience WorkExperience[]
	education      Education[]
	savedJobs      SavedJob[]
}

model WorkExperience {
	id              String        @id @default(uuid())
	talentProfileId String
	talentProfile   TalentProfile @relation(fields: [talentProfileId], references: [id], onDelete: Cascade)
	company         String
	role            String
	startDate       DateTime
	endDate         DateTime?
	description     String?
}

model Education {
	id              String        @id @default(uuid())
	talentProfileId String
	talentProfile   TalentProfile @relation(fields: [talentProfileId], references: [id], onDelete: Cascade)
	institution     String
	degree          String
	fieldOfStudy    String
	startDate       DateTime
	endDate         DateTime?
}

model EmployerProfile {
	id                String  @id @default(uuid())
	userId            String  @unique
	user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
	companyName       String  @db.VarChar(255)
	contactPerson     String
	phoneNumber       String?
	industry          String
	companySize       String
	rcNumber          String? @unique // Company Registration / RC Number
	description       String? // Updated later via PATCH /api/v1/employer/profile
	logoUrl           String? // Updated later via PATCH /api/v1/employer/profile
	isProfileComplete Boolean @default(false) // Mandatory check before posting jobs
	website           String? @db.VarChar(255)
	location          String? // e.g., "Lagos, Nigeria"
	officeAddress     String? // e.g., "123 Tech Avenue, Victoria Island"

	jobs               Job[]
	subscriptions      EmployerSubscription[]
	verificationStatus VerificationStatus     @default(PENDING)
	rejectionReason    String?
	payments           Payment[]
	conversations      Conversation[]
	createdAt          DateTime               @default(now())
	updatedAt          DateTime               @updatedAt
}

model Job {
	id              String          @id @default(uuid())
	employerId      String
	employer        EmployerProfile @relation(fields: [employerId], references: [id], onDelete: Cascade)
	title           String          @db.VarChar(255)
	description     String
	location        String
	employmentType  String
	jobType         String?
	industry        String?
	experienceLevel String?
	department      String
	minSalary       Float?       // Optional, as some jobs hide salary
	maxSalary       Float?       // Optional
	requiredSkills  String[]
	qualification   String
	deadline        DateTime
	status          JobStatus       @default(DRAFT)
	createdAt       DateTime        @default(now())
	updatedAt       DateTime        @updatedAt

	applications Application[]
	savedJobs    SavedJob[]
}

model SavedJob {
	id              String   @id @default(uuid())
	talentProfileId String
	jobId           String
	savedAt         DateTime @default(now())

	talentProfile TalentProfile @relation(fields: [talentProfileId], references: [id], onDelete: Cascade)
	job           Job           @relation(fields: [jobId], references: [id], onDelete: Cascade)

	// prevents duplicate saves at the DB level
	@@unique([talentProfileId, jobId])
}

model Application {
	id            String            @id @default(uuid())
	jobId         String
	job           Job               @relation(fields: [jobId], references: [id], onDelete: Cascade)
	talentId      String
	talentProfile TalentProfile     @relation(fields: [talentId], references: [id], onDelete: Cascade)
	status        ApplicationStatus @default(PENDING)
	conversation  Conversation?
	appliedAt     DateTime          @default(now())
	interviews    Interview[]

	@@unique([jobId, talentId]) // Enforces database-level constraint: A talent can only apply once per job
}

model Interview {
	id            String          @id @default(uuid())
	applicationId String
	application   Application     @relation(fields: [applicationId], references: [id])
	scheduledAt   DateTime
	location      String // Can be a physical address or a Zoom/Meet link
	instructions  String? // Optional instructions for the candidate
	status        InterviewStatus @default(SCHEDULED)
	createdAt     DateTime        @default(now())
	updatedAt     DateTime        @updatedAt
}

// --- MONETIZATION MODELS ---

model SubscriptionPlan {
	id             String                 @id @default(uuid())
	name           String                 @unique @db.VarChar(100)
	price          Decimal
	durationMonths Int // Rules 2: Predefined durations (e.g., 3, 6, 12)
	jobLimit         Int                    @default(-1) 
	applicationLimit Int                    @default(-1)
	benefits       String[] // Rule 3: Array of strings for benefits
	isActive       Boolean                @default(true) // Rule 11: Admin can deactivate
	subscriptions  EmployerSubscription[]
	payments       Payment[]
	createdAt      DateTime               @default(now())
	updatedAt      DateTime               @updatedAt
}

model EmployerSubscription {
	id         String             @id @default(uuid())
	employerId String
	employer   EmployerProfile    @relation(fields: [employerId], references: [id])
	planId     String
	plan       SubscriptionPlan   @relation(fields: [planId], references: [id])
	status     SubscriptionStatus @default(ACTIVE)
	startDate  DateTime           @default(now()) // Rule 6: Start date
	endDate    DateTime // Rule 6: Expiry date
	createdAt  DateTime           @default(now())
	updatedAt  DateTime           @updatedAt
}

model Payment {
	id        String        @id @default(uuid())
	reference String        @unique
	amount    Decimal
	status    PaymentStatus @default(PENDING)
	currency  String        @default("NGN")
	channel   String? // card, bank, etc.

	employerId String
	employer   EmployerProfile @relation(fields: [employerId], references: [id])

	planId String
	plan   SubscriptionPlan @relation(fields: [planId], references: [id])

	createdAt DateTime @default(now())
	updatedAt DateTime @updatedAt
}

// --- PLATFORM MESSAGING MODELS ---

model Conversation {
	id            String          @id @default(uuid())
	applicationId String          @unique
	application   Application     @relation(fields: [applicationId], references: [id], onDelete: Cascade)
	employerId    String
	employer      EmployerProfile @relation(fields: [employerId], references: [id])

	talentId      String
	talentProfile TalentProfile @relation(fields: [talentId], references: [id])

	deletedByEmployer  Boolean  @default(false)
	deletedByCandidate Boolean  @default(false)
	createdAt          DateTime @default(now())
	updatedAt          DateTime @updatedAt

	messages Message[]
}

model Message {
	id             String       @id @default(uuid())
	conversationId String
	conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

	senderId String // User ID of the sender
	content  String
	isRead   Boolean @default(false)

	createdAt DateTime @default(now())
}

model AuditLog {
	id      String @id @default(uuid())
	adminId String
	admin   User   @relation(fields: [adminId], references: [id])

	action       String
	entity       String // e.g., "FAQ", "ANNOUNCEMENT", "USER"
	entityId     String? // Optional ID of the affected record
	targetUserId String? // Kept from your original schema 
	details      Json? // Using Json for flexible data storage

	createdAt DateTime @default(now())
}

model Faq {
	id          String   @id @default(uuid())
	question    String
	answer      String
	isPublished Boolean  @default(true)
	createdAt   DateTime @default(now())
	updatedAt   DateTime @updatedAt
}

model Announcement {
	id          String   @id @default(uuid())
	title       String
	message     String
	isPublished Boolean  @default(true)
	createdAt   DateTime @default(now())
	updatedAt   DateTime @updatedAt
}

model SiteContent {
	id        String   @id @default(uuid())
	key       String   @unique // e.g. "ABOUT_US", "CONTACT_INFO"
	value     Json
	updatedAt DateTime @updatedAt
}

model BroadcastNotification {
	id      String @id @default(uuid())
	title   String
	message String

	targetAudience String

	status       String @default("PENDING") // 'PENDING', 'COMPLETED', 'FAILED'
	successCount Int    @default(0)
	failureCount Int    @default(0)

	adminId String
	admin   User   @relation(fields: [adminId], references: [id])

	createdAt DateTime @default(now())
}

model Notification {
	id          String           @id @default(uuid())
	userId      String           // The user receiving the notification
	user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)
	type        NotificationType
	title       String
	description String
	isRead      Boolean          @default(false)
  
	createdAt   DateTime         @default(now())
	updatedAt   DateTime         @updatedAt
}

```



