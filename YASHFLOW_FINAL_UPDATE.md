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

## 8. Productivity features — final employee/admin layer
- [x] Smart Next Work card combines Orders + Tasks.
- [x] Priority engine considers Urgent/High, due date, Rework and In Progress.
- [x] Stage Checklist / SOP admin manager.
- [x] Required checklist enforced in UI and database before Stage completion.
- [x] Checklist visible in Assigned Orders and Full Order View.
- [x] Checklist changes support Pending Sync during weak/offline network.
- [x] Unified Activity History for Order, Stage, Task, Attendance and assignments.
- [x] Activity History shows actor, timestamp and before → after values.
- [x] Stuck workflow alerts use existing workflow delay settings.
- [x] Overdue Order and Task alerts are generated for Admin.
- [x] Stuck/overdue alerts are de-duplicated once per entity/day.
- [x] Offline Queue covers Task Start/Complete/Note, Order Start/Complete, Checklist changes and Attendance Punch.
- [x] Offline actions display a global Pending Sync banner.
- [x] Attendance offline replay keeps captured time, validates max 12-hour age and requires Admin Review.
- [x] Attendance offline replay uses action receipts to prevent duplicate Punch.
- [x] Order completion replay checks current stage state before retrying.

SQL:
- `sql/2026-09-20-productivity-features.sql`

Resilience safeguards:
- [x] Offline actions are scoped to the employee who created them.
- [x] Attendance offline de-duplication uses Employee + India Business Date + Action Type.
- [x] Permanent/conflict offline errors move to Needs Review without blocking later valid actions.
- [x] Task status replay is version-aware and will not overwrite newer Admin/Employee changes.
- [x] Sequential offline Task actions preserve the queued version timestamp.
- [x] Stage Checklist definitions are snapshotted per Order Stage; later SOP edits affect new stages only.
- [x] Checklist definitions are archived/deactivated instead of destructively deleted.
- [x] Order Stage Start uses one atomic RPC for online and offline actions.
- [x] Stuck/Overdue alert scan runs automatically every 15 minutes through Supabase Cron.
- [x] Manual Admin Refresh uses the same DB scanner as Cron.
- [x] Activity History update rows store changed-field diffs instead of full duplicate rows.

Productivity smoke tests:
- Next Work picks an Urgent item ahead of normal work.
- Due Today / Overdue changes Next Work priority correctly.
- Required Stage Checklist prevents Stage Complete until required steps are checked.
- Optional checklist steps do not block completion.
- Checklist works from My Orders and Full Order View.
- Task Start while offline appears as Pending Sync and syncs after internet returns.
- Task Complete and Employee Note replay exactly once.
- Order Start replay does not duplicate workflow history on normal retry.
- Order Complete replay does not re-complete an already completed/submitted stage.
- Offline Punch In/Out shows Pending Sync and becomes Admin Review Pending after sync.
- Activity History records Order / Task / Attendance changes with before → after values.
- Delayed workflow creates one Admin alert per day, not repeated alert spam.
- Overdue Order / Task creates Admin notification + tone.

## 9. Quality gate
- [x] Stabilization branch has CI on push.
- [ ] SQL migration sanity PASS on latest commit.
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
2. Run `sql/2026-09-20-final-stability-guards.sql`.
3. Resolve any duplicate-data error reported by stability guards.
4. Run `sql/2026-09-20-admin-direct-complete.sql`.
5. Run `sql/2026-09-20-safe-workflow-delete.sql`.
6. Run `sql/2026-09-20-order-task-change-notifications.sql`.
7. Run `sql/2026-09-20-productivity-features.sql`.
8. Verify Supabase Cron contains `yashflow-stuck-alert-scan` (every 15 minutes).
9. Confirm Preview server has required Supabase server secret.
10. Preview smoke-test Admin + Employee + Offline/Online sync.
11. Confirm CI is fully green.
12. Merge PR #2 to main only after smoke-test approval.
13. Verify Vercel production deployment is Success.
14. Run final live smoke test.
15. Only then mark Final Update LIVE.
<!-- Vercel redeploy trigger: 2026-09-22 -->
