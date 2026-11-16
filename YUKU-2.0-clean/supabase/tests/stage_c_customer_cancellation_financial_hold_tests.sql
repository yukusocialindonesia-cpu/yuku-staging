-- STAGE C — MANUAL/INTEGRATION TEST PLAN FOR MIGRATIONS 23-24
-- Run only in a disposable Supabase staging project with seeded test users.
-- Do not run these as production data mutations.

-- Preconditions to verify before running scenario tests:
-- 1. Migrations 01-24 applied successfully in order.
-- 2. Trigger on public.bookings still calls public.handle_booking_refund_financials().
-- 3. A test Customer, Talent, Admin, future booking, settled_held payment,
--    talent_earnings row, and referral_rewards row exist.

-- Scenario A: Customer cancels 12 hours before session.
-- Expected:
-- - customer_cancellation_cases.policy_code = '6_to_24h'
-- - automatic_refund_amount = floor(payment.amount / 2)
-- - retained_pending_admin_amount = payment.amount - automatic_refund_amount
-- - booking.status = 'cancelled_by_customer'
-- - talent_earnings.status = 'disputed_hold' (if earning row exists)
-- - no financial_adjustments_reversals row is created
-- - referral reward remains non-payable (pending_completion)

-- Scenario B: Customer cancels 3 hours before session.
-- Expected:
-- - policy_code = 'under_6h'
-- - automatic_refund_amount = 0
-- - retained_pending_admin_amount = full payment amount
-- - Talent earning remains disputed_hold; no reversal row

-- Scenario C: Customer cancels 30 hours before session.
-- Expected:
-- - policy_code = 'more_than_24h'
-- - automatic_refund_amount = full payment amount
-- - retained_pending_admin_amount = 0
-- - Talent earning is refund_adjusted and exactly one reversal row exists

-- Scenario D: attempt cancellation while Talent earning has allocated_payout_amount > 0
-- or paid_out_amount > 0 and retained amount would be held.
-- Expected: transaction raises an exception and booking status/case remain unchanged.

-- Scenario E: replay the cancellation RPC for the same booking.
-- Expected: rejected by the unique booking_id / existing-case guard; no duplicate refund.

-- Scenario F: verify a held/disputed earning is excluded from payout availability.
-- Expected: existing payout validation only includes available_for_payout and
-- partially_paid_out statuses, so disputed_hold cannot be reserved.

-- These are acceptance criteria, not proof of execution. Record actual results
-- and PostgreSQL/Supabase version in the staging test report.
