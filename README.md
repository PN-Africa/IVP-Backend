# IVP Africa Backend

A concise, up-to-date README for the IVP Africa backend service.

Overview
- Backend: NestJS + TypeScript, using Prisma for PostgreSQL access.
- Features: authentication (JWT), employer/talent profiles, job postings, applications, subscriptions, payments (webhooks), messaging, and admin utilities.

Quick links
- API reference and full schema: [API-documentation.md](API-documentation.md)

Requirements
- Node.js 18+ (recommended), npm
- PostgreSQL database
- Environment variables configured (see section below)

Getting started (development)
1. Install dependencies

```bash
npm install
```

2. Generate Prisma client

```bash
npx prisma generate
```

3. Run the app (development)

```bash
npm run start:dev

```

Production build

```bash
npm run build
npm run start
```

Scripts
- `npm run start` — Start NestJS in production mode
- `npm run start:dev` — Start development server with watch mode
- `npm run build` — Build the app
- `npm run lint` — Run ESLint and auto-fix
- `npm test` — Run Jest tests

Environment variables (important)
- `DATABASE_URL` — Postgres connection string used by the app
- `DIRECT_URL` — Direct DB URL used by Prisma tools (optional)
- `JWT_SECRET` — JWT signing secret
- `API_URL` — Public API URL used in email links
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` — Email delivery
- `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_BUCKET` — File storage (uploads)
- `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY` — Payment provider credentials

API and documentation
- The server applies a global prefix: `/api/v1` (see `src/main.ts`).
- Interactive Swagger UI is available (when enabled) at `/api/docs` on the running server.
- For a consolidated, human-readable API reference and the Prisma schema, see [API-documentation.md](API-documentation.md).

Important notes & maintenance
- Some controllers use explicit `@Controller('api/v1/...')` in addition to the global prefix — this can produce duplicate routes like `/api/v1/api/v1/...`. Prefer relative controller prefixes and rely on the global prefix.
- `Talent` routes may not be registered: the talent controller exists but the corresponding module is not imported into `AppModule`.
- `UsersModule` and `ApplicationsModule` are currently placeholders and may require controllers if you intend to enable them.

Database
- The app uses Prisma; the full schema is included in `API-documentation.md` and `prisma/schema.prisma`.

Contributing & maintenance tips
- Keep secrets out of version control — use environment variables or a secrets manager.
- When adding routes that accept files, use Nest's `FileInterceptor` and `ParseFilePipeBuilder` to enforce size/type limits centrally.
- After editing `prisma/schema.prisma`, run `npx prisma generate` and apply migrations as appropriate.

Contact
- For questions about this codebase, check the controllers in `src/modules/` and open an issue with reproduction steps.

```json
{
  "success": true,
  "message": "Paystack configurations validated and loaded into internal memory safely."
}
```

### Applications

- `POST /api/v1/applications/apply/:jobId`
  - Description: Apply to a job as an authenticated talent user.
  - Requirements: JWT auth (role: `TALENT`).
  - Body: none (application uses the authenticated user's talent profile and the `jobId` URL param).
  - Response (201 Created):
    ```json
    { "message": "Application submitted", "applicationId": "<uuid>" }
    ```

- `GET /api/v1/applications/my-applications`
  - Description: Retrieve the authenticated talent user's applications.
  - Requirements: JWT auth (any authenticated user, typically `TALENT`).
  - Query: optional pagination/search parameters (implementation-defined).
  - Response (200):
    ```json
    [{ "applicationId": "<uuid>", "jobId": "<uuid>", "status": "PENDING", "appliedAt": "2026-08-12T..." }, ...]
    ```

### Talent profile endpoints

- `PUT /api/v1/talent/profile/personal`
  - Description: Update personal information for the authenticated talent user.
  - Requirements: JWT auth.
  - Body (example):
    ```json
    {
      "firstName": "Jane",
      "lastName": "Doe",
      "headline": "Backend Engineer",
      "location": "Lagos, NG"
    }
    ```
  - Response (200): updated talent profile object.

- `POST /api/v1/talent/profile/experience`
  - Description: Add a work experience entry to the authenticated talent profile.
  - Requirements: JWT auth.
  - Body (example):
    ```json
    {
      "company": "ACME Corp",
      "role": "Software Engineer",
      "startDate": "2022-01-01",
      "endDate": "2023-12-31",
      "description": "Worked on APIs"
    }
    ```
  - Response (201): created work experience object.

- `POST /api/v1/talent/profile/education`
  - Description: Add an education entry.
  - Requirements: JWT auth.
  - Body (example):
    ```json
    {
      "institution": "University",
      "degree": "BSc Computer Science",
      "fieldOfStudy": "Computer Science",
      "startDate": "2016-09-01",
      "endDate": "2020-06-30"
    }
    ```
  - Response (201): created education object.

- `PUT /api/v1/talent/profile/skills`
  - Description: Replace or update the skills array for the talent profile.
  - Requirements: JWT auth.
  - Body (example):
    ```json
    { "skills": ["Node.js", "TypeScript", "PostgreSQL"] }
    ```
  - Response (200): updated skills list.

### Messaging (admin)

- `GET /api/v1/messaging/admin/conversations`
  - Description: Admin-only listing of all conversations with optional search.
  - Requirements: JWT auth and admin role (`ADMIN` or `SUPER_ADMIN`).
  - Query: `?search=<query>` (optional)
  - Response (200): array of conversation summaries.

### Payments / Webhook notes

- `POST /api/v1/payments/webhook`
  - Description: Paystack webhook receiver. The endpoint accepts webhook posts and responds immediately with HTTP 200 to acknowledge delivery, then processes the payload asynchronously.
  - Requirements: None for the external service, but the request must include header `x-paystack-signature` for signature verification.
  - Body: Paystack event payload (implementation forwards to `PaymentsService.handlePaystackWebhook`).
  - Response: 200 OK (empty) — processing happens in background.

For correctness: ensure your Paystack webhook settings send the `x-paystack-signature` header and that `PAYSTACK_SECRET_KEY` is set in environment variables.

## Contributors & Maintenance

- Keep secrets out of the repository (`.env` should never be committed).
- If you add controllers, prefer using relative controller paths (e.g., `@Controller('messaging')`) and rely on the global prefix set in `src/main.ts` (`api/v1`) to avoid duplicated prefixes.
- When adding new endpoints that accept uploads, use `FileInterceptor` and `ParseFilePipeBuilder` (as the employer profile update does) to centrally enforce file-type and size limits.


## Auth and Email Flow

- Registration creates a `User` and either a `TalentProfile` or `EmployerProfile`.
- A verification token is emailed to the user.
- Email verification updates `isVerified` and clears `verificationToken`.
- Password reset generates a token and expiry, sends it by email, then confirms with `password-reset/confirm`.

## Notes

- `AuthService` uses `bcrypt` for password hashing.
- The `EmailService` builds verification and reset URLs from `API_URL`.
- `PrismaService` uses `@prisma/adapter-pg` and connects on module init.
- The API currently has mocked job creation and payment initialization for architecture validation.

## Running the Project

Install dependencies:

```bash
npm install
```

Generate Prisma client (runs automatically after install):

```bash
npm run postinstall
```

Start in development mode:

```bash
npm run start:dev
```

Run tests:

```bash
npm test
```
