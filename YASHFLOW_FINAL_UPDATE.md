# YashFlow Final Stabilization Update

Branch: `stabilization/final-update`  
Draft PR: #2  
Production merge/deploy: **DO NOT MERGE until SQL + CI + smoke tests pass**

## 1. Safety / data integrity
- [x] Remove automatic destructive Order reset from app shell.
- [x] Remove clear-existing-orders endpoint.
- [x] Add attendance employee/date uniqueness guard.
- [x] Add one-active-office-settings guard.
- [x] Add employee auth-user uniqueness guard.
- [x] Add one pending manual-attendance request per employee/date guard.
- [x] Add Order Number uniqueness guard.
- [x] Admin Direct Complete is atomic RPC.
- [x] Workflow Template delete is atomic RPC with child cleanup.

SQL:
1. `sql/2026-09-20-final-stability-guards.sql`
2. `sql/2026-09-20-admin-direct-complete.sql`
3. `sql/2026-09-20-safe-workflow-delete.sql`

## 2. Attendance
- [x] Fix Check In geofence TypeScript/build issue.
- [x] Harden Check Out against duplicate attendance rows.
- [x] Employee can Early Punch Out.
- [x] Early Punch Out requires reason.
- [x] Early Punch Out becomes Admin Review Pending.
- [x] Admin receives Early Punch Out notification.
- [x] Shared canonical attendance rule used in management/reports/performance/calendars.
- [x] India timezone/date normalization added.

Smoke tests:
- Normal Check In.
- GPS rejected outside allowed radius.
- Normal Check Out.
- Early Check Out without reason rejected.
- Early Check Out with reason saves and Admin sees pending review.
- Duplicate legacy attendance does not select a closed row over an open row.

## 3. Employee Orders / Tasks
- [x] Assigned Orders tabs use the employee's actual Primary/Support active work.
- [x] Employee Order full detail keeps one clean Complete Workflow view.
- [x] Proof/Approval hidden employee UI remains native; no DOM override.
- [x] My Tasks explicitly loads Primary + active Support assignments.
- [x] Completed Tasks includes employee Support tasks.
- [x] Today's Work explicitly loads Primary + Support Orders and Tasks.
- [x] Employee Work Calendar includes support Task/Order work.
- [x] Admin Work Calendar uses the same support/canonical rules.
- [x] Employee permission-based Admin Access is native.

## 4. Central Order / Task notifications
- [x] Central DB trigger notification architecture.
- [x] Task create/update/status/note/priority/due-date/primary changes notify affected employees.
- [x] Task Support add/remove notifies affected employee.
- [x] Order detail/workflow/stage/status changes notify assigned team.
- [x] Order stage assignment changes notify assigned employee.
- [x] 2-second per employee/entity de-duplication prevents tone storms.
- [x] Old page-level duplicate notification inserts removed.
- [x] Employee/Admin notification sound is Always ON.
- [x] First user interaction silently unlocks browser audio.
- [x] Read notification disappears from UI.
- [x] Order/Task notification icons mapped.

SQL:
- `sql/2026-09-20-order-task-change-notifications.sql`

Important: Custom `notification.wav` tone is reliable while YashFlow is loaded after the user's first interaction. Fully-killed browser/PWA delivery requires a separate Web Push/VAPID implementation.

Smoke tests:
- Admin changes Order priority -> assigned employee gets one notification + tone.
- Admin changes Order note -> assigned employee gets one notification + tone.
- Employee/Admin changes Task status -> Primary + active Support see alert.
- Add Task Support -> new Support gets alert.
- Remove Task Support -> removed Support gets alert.
- Stage starts/changes/completes -> Order team gets alert without repeated tone burst.
- Open notification -> it disappears from unread list.

## 5. Workflow / Leave
- [x] Delete Workflow fixed via atomic DB function.
- [x] Default workflow cannot be deleted.
- [x] Used workflow cannot be deleted; deactivate instead.
- [x] Active work requires Primary Handover before Leave approval.
- [x] Leave handover validation moved into native component logic.
- [x] Global Leave DOM observer removed.

## 6. Production flow
- [x] Packing and Dispatch use one completed-order eligibility rule.
- [x] Dispatch state changes constrained to safe transitions.
- [x] Dispatch/Delivery dates required for relevant statuses.
- [x] Purchase Receive Quantity cannot exceed remaining quantity.
- [x] Accounts is the single financial Payment/Billing source.
- [x] Production Details no longer edits duplicate Payment/Billing fields.

## 7. UI / maintainability
- [x] Glossy 3D Yash Laser button system in shared CSS.
- [x] Blue = work/start action.
- [x] Gold = primary/brand action.
- [x] Green = success/complete.
- [x] Amber = warning/hold.
- [x] Red = danger.
- [x] Silver = secondary/back.
- [x] Remove YashFlowOverrides DOM mutation layer.
- [x] Remove Admin Reports portal injection.
- [x] Remove Admin Dashboard DOM accordion helper.
- [x] Admin tools moved into native Daily vs Advanced sections.
- [x] Remove redundant misspelled `app/menifest.ts`.

## 8. Quality gate
- [x] Stabilization branch has CI on push.
- [x] TypeScript check PASS.
- [x] Next.js production build PASS.
- [x] ESLint advisory reviewed.
- [ ] Required SQL migrations applied in Supabase.
- [ ] Admin smoke test.
- [ ] Employee smoke test.
- [ ] Merge PR #2 to main.
- [ ] Verify Vercel deployment Success.
- [ ] Only then mark Final Update LIVE.

## Required deployment order
1. Take/verify database backup.
2. Run stability-guard SQL.
3. Resolve any duplicate-data error reported by guard SQL.
4. Run Admin Direct Complete SQL.
5. Run Workflow Delete SQL.
6. Run Order/Task Notification SQL.
7. Confirm CI is green.
8. Merge PR #2.
9. Verify Vercel deployment is Success.
10. Smoke-test Admin and Employee on mobile.
