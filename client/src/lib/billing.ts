/**
 * Master switch for the paid-tier (Stripe) UI.
 *
 * All the billing code — checkout, portal, upgrade prompts — stays in the
 * codebase, but every user-facing entry point is gated behind this flag so the
 * app runs as a fully-free product when it's off. Flip on by setting
 * VITE_BILLING_ENABLED=true in client/.env (and configuring the Stripe keys
 * on the backend) when you want to start selling.
 *
 * Defaults to OFF.
 */
export const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === 'true'
