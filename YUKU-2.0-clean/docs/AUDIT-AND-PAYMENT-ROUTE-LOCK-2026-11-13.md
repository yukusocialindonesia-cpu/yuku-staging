# YUKU 2.0 — Full Static Audit & Payment Route Lock

Source audited: `YUKU-2.0-GABUNGAN-LENGKAP-REVISI-04.zip`

## Audit scope

The complete extracted project was inspected, including frontend source, Supabase migrations, Edge Functions, SQL tests/ops scripts, package configuration, and the existing QRIS/Xendit implementation. Payment-related references were traced across booking creation, payment settlement, QRIS submission/review, Xendit checkout/webhook, ledger triggers, refunds/cancellation, and Admin UI.

## Critical finding before remediation

The previous implementation did **not** guarantee one payment route per booking:

- `payments.booking_id` was unique, but no route was claimed before external Xendit checkout creation.
- QRIS proof submission could create a manual QRIS submission without first locking the booking away from Xendit.
- `admin_review_qris_payment()` could create/update a manual QRIS payment without verifying that Xendit had not already claimed the booking.
- `settle_booking_payment()` accepted the provider passed by the trusted caller without a booking-level route invariant.
- The frontend displayed QRIS but did not expose the existing Xendit checkout function.

These conditions created a race/conflict window.

## Remediation

Migration `30_payment_route_lock_xendit_qris.sql` adds:

- `bookings.payment_route` (`NULL`, `xendit`, or `manual_qris`)
- backfill from existing `payments.provider`
- `claim_booking_payment_route()` with `SELECT ... FOR UPDATE`
- route verification in `settle_booking_payment()`

Xendit checkout now claims `xendit` before creating an invoice.

QRIS proof submission now claims `manual_qris` before accepting the proof.

QRIS Admin approval requires the booking to already be locked to `manual_qris`.

The Booking History UI now exposes both Xendit and QRIS while the booking has no route. Once one route is claimed, the other route is blocked by the database.

## QRIS administration

QRIS configuration remains data-driven through `qris_payment_settings`. Admin can upload a new versioned image path and activate it without changing application source code. Historical QRIS assets are not overwritten.

## Business rules checked

- Normal commission: 20% YUKU.
- Talent share: 80%.
- Referral: 10% of YUKU commission, one tier.
- More than 24h cancellation: 100% refund.
- 6–24h: 50% refund and 50% retained for Admin decision.
- If retained 50% is assigned to Talent: the retained amount is Talent compensation without additional YUKU commission/referral.
- Under 6h: manual/Admin handling.
- QRIS: manual Admin verification.
- Xendit integration remains present.

## Important deployment observation

`supabase/FULL_MIGRATION_V20.sql` does not include migrations 27–30. Deployment must therefore apply the numbered migrations through `30_payment_route_lock_xendit_qris.sql`, or a regenerated full migration must be created before using a single-file deployment workflow.

## Test/build status

This audit is static unless a staging Supabase project and Xendit sandbox are connected. Do **not** treat this report as evidence of successful production build, live payment testing, webhook testing, or production readiness.
