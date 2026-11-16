-- YUKU migration 27: register manual QRIS provider. Apply/commit before migration 28.
ALTER TYPE public.payment_provider_type ADD VALUE IF NOT EXISTS 'manual_qris';
