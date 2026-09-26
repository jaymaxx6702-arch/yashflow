# YashFlow Vercel Production Migration

Target production domain: `https://app.yashlaser.in`

Current temporary host: Railway / `https://app2.yashlaser.in`

## Cutover rule

Do not remove Railway or `app2.yashlaser.in` until Vercel production has passed the full smoke test.

## Required Vercel environment variables

Copy the actual production values into the YashFlow Vercel project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `YASHFLOW_ANDROID_KEYSTORE_BASE64`
- `YASHFLOW_ANDROID_KEYSTORE_PASSWORD`
- `YASHFLOW_ANDROID_KEY_ALIAS`
- `YASHFLOW_ANDROID_KEY_PASSWORD`
- `YASHFLOW_INTEGRATION_SECRET`
- `YASHFLOW_INTEGRATION_EMPLOYEE_ID`

Railway-generated `RAILWAY_*` variables are not required on Vercel.

## GitHub repository variables after Vercel is live

Set:

- `YASHFLOW_APP_URL=https://app.yashlaser.in`
- `YASHFLOW_SIGNING_ENDPOINT=https://app.yashlaser.in/api/internal/android-signing`
- `YASHFLOW_MAINTENANCE_ENDPOINT=https://app.yashlaser.in/api/internal/maintenance/orders`

The workflows currently fall back to Railway/app2 so existing production keeps working before cutover.

## Shop integration

The Shop project must retain:

- `YASHFLOW_SYNC_ENABLED=true`
- `YASHFLOW_API_URL=https://app.yashlaser.in`
- `YASHFLOW_API_SECRET` matching YashFlow `YASHFLOW_INTEGRATION_SECRET`

The exact previous `YASHFLOW_INTEGRATION_EMPLOYEE_ID` was not recoverable after test-order cleanup and must be configured explicitly before enabling production sync.

## Smoke test before Railway removal

1. Login as admin.
2. Login as employee.
3. Punch in/out.
4. Create an order.
5. Start and complete a stage.
6. Confirm notifications.
7. Confirm Team Production Flow and dashboard live data.
8. Confirm shop order sync creates exactly one YashFlow order.
9. Confirm Android signing endpoint works through GitHub OIDC.
10. Build signed APK with `YASHFLOW_APP_URL=https://app.yashlaser.in`.
11. Install/update APK and verify it opens `app.yashlaser.in`.
12. Confirm auto-update/version endpoint.
13. Only then remove Railway/app2.

## Current migration-prep commits

- `2470bf4` — configurable maintenance endpoint
- `454c773` — configurable Android signing endpoint
- `e9c2b40` — configurable Android app URL
- `2a3a84b` — GitHub repository variable wired into Android release workflow

## Known unrelated CI status

The current Quality Check has pre-existing ESLint failures in dashboard components. TypeScript, production build, SQL sanity, and runtime smoke passed on the migration-prep run. These lint failures existed before the Vercel migration commits and are not caused by the domain/hosting migration.
