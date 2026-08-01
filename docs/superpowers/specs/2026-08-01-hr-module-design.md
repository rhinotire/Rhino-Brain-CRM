# HR Module — Employee Records & Document Vault

**Date:** 2026-08-01
**Status:** Approved by owner (方案 A)
**App:** apps/rhino-brain

## Purpose

Give RHINO BRAIN an HR module where the owner and managers keep employee
records and retain scanned HR documents (application, driver license, work
permit, direct deposit authorization, signed offer letter, etc.), plus a
download area for the blank new-hire packet templates created 2026-08-01.

## Decisions (owner-confirmed)

1. **Access:** ADMIN + MANAGER see the HR module. Sensitive documents
   (driver license, work permit, direct deposit authorization) are
   **downloadable by ADMIN only** — managers see "on file" status but cannot
   open them. Document deletion is ADMIN only.
2. **Employee profile:** basic info only — name, position, location
   (Rhino FL / Everflow TX), phone, email, hire date, employment status.
   No pay fields (can be added later).
3. **Expiry tracking:** documents with an expiration date (work permit,
   driver license) show **red = expired, yellow = expires within 30 days**
   on both the employee list and detail page. No notification bell (later).

## Architecture

Mirror the proven Customers document pattern end to end: Prisma model +
server actions + Supabase private bucket + signed download URLs.

### Data model (packages/database/prisma/schema.prisma)

```prisma
enum EmployeeStatus { ACTIVE TERMINATED }

enum EmployeeDocType {
  APPLICATION          // employment application
  DRIVER_LICENSE       // sensitive
  WORK_PERMIT          // sensitive (EAD / visa / green card copy)
  DIRECT_DEPOSIT_AUTH  // sensitive (bank info)
  OFFER_LETTER         // signed
  POLICY_ACK           // signed policy acknowledgments
  W4_FORM
  I9_FORM
  EMERGENCY_CONTACT
  OTHER
}

model Employee {
  id         String         @id @default(cuid())
  name       String
  position   String?
  phone      String?
  email      String?
  hireDate   DateTime?
  status     EmployeeStatus @default(ACTIVE)
  endDate    DateTime?      // set when TERMINATED
  notes      String?
  locationId String         // company isolation: Rhino FL vs Everflow TX
  location   Location       @relation(fields: [locationId], references: [id])
  userId     String?        @unique // optional link to CRM login
  user       User?          @relation(fields: [userId], references: [id])
  documents  EmployeeDocument[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([locationId, status])
}

model EmployeeDocument {
  id           String          @id @default(cuid())
  employeeId   String
  employee     Employee        @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  type         EmployeeDocType
  fileName     String
  storagePath  String          // Supabase Storage object path
  fileSize     Int
  mimeType     String
  expiresAt    DateTime?       // work permit / driver license expiration
  sensitive    Boolean         @default(false)
  notes        String?
  uploadedById String
  uploadedBy   User            @relation("EmployeeDocsUploaded", fields: [uploadedById], references: [id])
  createdAt    DateTime @default(now())

  @@index([employeeId])
  @@index([type, expiresAt])
}
```

`Location` gains `employees Employee[]`; `User` gains `employee Employee?`
and `employeeDocsUploaded EmployeeDocument[]`. Migration is additive only.

### Storage (src/lib/storage.ts)

New **private** bucket `employee-docs`, reusing the existing private-bucket
internals (extract the bucket name into a parameter shared with
`customer-docs`; existing exports keep their signatures). Same helpers:
upload, signed URL (300 s), delete. Same "storage not configured" fallback
message when `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are absent.

### Server actions (src/actions/hr.ts)

All actions start with `requireSession()` + `isManager()` gate; location
scoping follows the existing pattern (ADMIN sees all; MANAGER with a
`locationId` sees only that location).

- `createEmployee` / `updateEmployee` — basic-info form. Location choices
  limited to the manager's own location for non-admins.
- `uploadEmployeeDocument` — 10 MB max, PDF/image MIME whitelist, path
  `employeeId/type/timestamp-name`, sensitive flag auto-set for
  DRIVER_LICENSE / WORK_PERMIT / DIRECT_DEPOSIT_AUTH.
- `getEmployeeDocumentUrl` — signed URL; **sensitive docs: ADMIN only**.
- `deleteEmployeeDocument` — **ADMIN only**; removes storage object then row.

### Pages (src/app/(app)/hr)

- `/hr` — employee list: name, position, location badge (existing shortTag
  badge style), status, document completeness (n/6 core docs), worst expiry
  flag (red/yellow dot). "New employee" button → form (customer-form
  pattern). Bottom section **"New-Hire Packet Templates"**: the four blank
  DOCX templates with download links.
- `/hr/[id]` — employee detail: editable basic info + document vault
  (component adapted from `customer-documents.tsx`): per-type status
  (Missing / On file / Expired), upload form with optional expiration date
  field for DRIVER_LICENSE / WORK_PERMIT, download (permission-aware),
  delete (ADMIN).

Core docs counted for completeness: APPLICATION, DRIVER_LICENSE,
WORK_PERMIT (only when applicable — not counted against completeness if
missing, shown as optional), DIRECT_DEPOSIT_AUTH, W4_FORM, I9_FORM,
EMERGENCY_CONTACT. Completeness = 6 required types (all but WORK_PERMIT).

### New-hire packet templates

The four DOCX files generated 2026-08-01 are committed to
`apps/rhino-brain/files/hr-templates/` (not `public/` — no anonymous
access). A route handler `src/app/api/hr-templates/[file]/route.ts` streams
them after an `isManager` session check, with an allowlist of the four
filenames. `next.config` gets `outputFileTracingIncludes` for that folder so
Vercel bundles the files.

### Navigation (src/app/(app)/layout.tsx)

New nav group "HR" `{ href: "/hr", label: "Employees", icon: "👥" }`
appended for ADMIN and MANAGER only (managerGroups conditional; not in
repGroups / accountingGroups).

## Error handling

- Storage unconfigured → same amber notice as customer docs.
- Upload validation errors returned as `ActionResult` and toasted.
- Signed-URL failures surface the error message; no silent fallbacks.

## Testing

- Unit tests for the pure helpers: expiry status (expired / warning-30d /
  ok) and document-permission rules (sensitive × role matrix), colocated
  the same way existing freight tests are.
- Manual verification in the preview: create employee, upload each doc
  type, confirm manager vs admin download behavior, expiry badges.

## Out of scope (later)

Pay/salary fields, PTO tracking, notification-bell expiry alerts, employee
self-service, Everflow-branded packet templates.
