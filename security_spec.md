# Security Specification — TimeLedger

## 1. Data Invariants
1. **Atomic Bootstrap**: Only one `system/bootstrap` document can ever be created, and only when it does not yet exist. Creation must atomically create the initial `Administrator` profile in `usersByEmail/{adminEmail}`.
2. **Identity & Role Integrity**: Users cannot self-assign or escalate their own `role` after bootstrap. Only a verified `Administrator` can create, update, or delete user profiles in `usersByEmail`.
3. **Strict Email Ownership**: An `Employee` can only read and create `timeEntries` where `employeeEmail == request.auth.token.email.lower()`.
4. **Status & Approval Isolation**: A newly created `timeEntry` must start with `status == 'Pending'` and `comments == ''`. Employees cannot set `status` to `'Approved'` or `'Rejected'`.
5. **Manager Scope**: A `Manager` can only read and review `timeEntries` assigned to them (`managerEmail == request.auth.token.email.lower()`).
6. **Terminal State Lock**: Once a `timeEntry` reaches `'Approved'` or `'Rejected'`, neither the Employee nor the Manager can alter it (only an Administrator override is permitted).
7. **Server Timestamps & Bounds**: Every `createdAt` and `updatedAt` must equal `request.time`. All strings, IDs, dates (`MM/DD/YYYY`), and numeric `hours` (`0.5`–`24.0`) are strictly bounded.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Read/Write**: Read `timeEntries` or write `usersByEmail` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Write `timeEntries` with `auth.token.email_verified == false` -> `PERMISSION_DENIED`.
3. **Second Bootstrap Hijack**: Create `system/bootstrap` after it already exists -> `PERMISSION_DENIED`.
4. **Privilege Escalation (Self-Admin)**: Employee updates their own `usersByEmail` doc to `role: 'Administrator'` -> `PERMISSION_DENIED`.
5. **Self-Approval on Create**: Employee creates `timeEntries` with `status: 'Approved'` -> `PERMISSION_DENIED`.
6. **Self-Approval on Update**: Employee updates their `Pending` entry to `status: 'Approved'` -> `PERMISSION_DENIED`.
7. **Cross-Employee Impersonation**: Employee A creates `timeEntries` with `employeeEmail: 'employeeb@corp.com'` -> `PERMISSION_DENIED`.
8. **Cross-Manager Hijack**: Manager A updates `timeEntries` belonging to Manager B -> `PERMISSION_DENIED`.
9. **Terminal State Tampering**: Employee edits an `Approved` entry's `hours` or `description` -> `PERMISSION_DENIED`.
10. **Shadow Field Injection**: Payload includes extra key `isAdminOverride: true` -> `PERMISSION_DENIED`.
11. **Invalid Hours / Date Poisoning**: `timeEntries` with `hours: 0.1` or `hours: 999` or `date: '2026-11-23'` -> `PERMISSION_DENIED`.
12. **Resource Exhaustion (1MB String)**: `description` with 5,000 characters or oversized doc ID -> `PERMISSION_DENIED`.
