-- Migration: Add marqeta_card_token to cards table
-- Reason: This token is essential for linking incoming Marqeta JIT Funding webhooks to the corresponding card and user in the system.

BEGIN;

ALTER TABLE public.cards
ADD COLUMN marqeta_card_token TEXT;

CREATE UNIQUE INDEX idx_cards_marqeta_card_token ON public.cards(marqeta_card_token);

COMMENT ON COLUMN public.cards.marqeta_card_token IS 'Unique token provided by Marqeta for card identification. Used for JIT funding webhooks.';

COMMIT;
