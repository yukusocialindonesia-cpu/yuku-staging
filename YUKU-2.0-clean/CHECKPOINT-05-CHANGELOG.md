# YUKU 2.0 — Checkpoint 05 (Refund Foundation)

## Changes in this checkpoint

1. Added `supabase/migrations/23_customer_cancellation_refund_foundation.sql`.
2. Replaced the Customer's direct `bookings` table update with the `request_customer_cancellation` RPC.
3. Exposed cancellation actions for eligible future bookings in `pending_payment`, `paid_held_in_escrow`, and `confirmed_by_talent` states.
4. Added an Admin refunds-tab panel listing retained funds awaiting Admin review.
5. Corrected `admin_process_refund` so a partial refund does not mark the entire payment as refunded; it checks cumulative processed refunds against the payment amount.
6. Updated migration documentation and root README.

## Policy snapshot implemented

- More than 24 hours before session: full refund request.
- More than 6 hours and up to 24 hours: 50% refund request; remaining 50% is recorded as held pending Admin review.
- 6 hours or less: no automatic refund; full payment is recorded as held pending Admin review.
- Unpaid booking: cancellation without a refund.

## Important limitations — NOT production-ready

- This migration has not been executed against PostgreSQL/Supabase staging. SQL syntax, triggers, permissions, and behavior must be verified in a staging database before use.
- Refunds are still manual at the payment provider/bank. No Xendit/Midtrans API or webhook integration was added.
- The Admin page now displays retained funds but does not yet provide a complete, auditable financial allocation workflow for deciding how those funds are distributed. Do not mark them resolved or pay them out.
- Existing booking financial reversal triggers reverse Talent earnings on cancellation. Any later decision to compensate Talent from retained funds needs a dedicated, tested financial-adjustment workflow.
- Dependencies could not be installed in this environment (`npm install --offline` had no cached package metadata), so a full Vite build and TypeScript project check were not run. The two edited TSX files passed TypeScript transpilation syntax checks only.
- The complete application has not been security-tested, browser-tested, or tested against a real payment provider.

## Safe next step

Apply migrations 01–23 only to a disposable/staging Supabase project after reviewing the SQL with the project owner. Run the existing Stage A/B SQL suites and add tests for migration 23 before enabling any checkout feature. Never apply this checkpoint directly to production.


## Additional remediation in working tree (migration 24)

- Added `supabase/migrations/24_hold_talent_earnings_during_customer_admin_review.sql` to prevent the existing booking financial trigger from reversing all Talent earnings while retained cancellation funds are awaiting Admin review.
- Pending earnings are set to `disputed_hold`, which the existing payout validation excludes. Referral rewards remain non-payable.
- Cancellation fails safely if the related Talent earning has already been allocated to payout or paid out.
- Added Stage C acceptance scenarios in `supabase/tests/stage_c_customer_cancellation_financial_hold_tests.sql`.
- This is a code-level remediation only; it has not been executed against PostgreSQL/Supabase and does not implement the Admin allocation decision workflow or payment-provider transfers.
