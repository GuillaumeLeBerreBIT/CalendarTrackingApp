import express from 'express';
import Stripe from 'stripe';
import { supabaseAdmin } from '../db/supabase.js';
import authRequire from '../utils/utils.js';

const router = express.Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
}

/**
 * POST /billing/create-checkout-session
 * Creates a Stripe Checkout session for the Plus plan.
 * Returns { url } — frontend redirects the browser there.
 */
router.post('/create-checkout-session', authRequire, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ success: false, error: 'Billing not configured.' });
  if (!process.env.STRIPE_PRICE_ID) return res.status(503).json({ success: false, error: 'Billing not configured.' });

  // userId is bound to the verified JWT in authRequire — safe to trust here.
  const userId = req.cookies.userId;
  const email = req.user?.email;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('plan, always_free')
    .eq('user_id', userId)
    .single();

  if (profile?.plan === 'plus' || profile?.always_free) {
    return res.status(400).json({ success: false, error: 'You already have Plus.' });
  }

  try {
    // Reuse an existing Stripe customer if we have one
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id ?? undefined;
    if (!customerId && email) {
      // Idempotency key keyed on the user prevents duplicate customers if the
      // request is retried before the row is written.
      const customer = await stripe.customers.create(
        { email, metadata: { user_id: userId } },
        { idempotencyKey: `cust_${userId}` },
      );
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.APP_URL ?? 'http://localhost:5173'}/profile?checkout=success`,
      cancel_url:  `${process.env.APP_URL ?? 'http://localhost:5173'}/pricing?checkout=cancelled`,
      allow_promotion_codes: true,
      metadata: { user_id: userId },
      subscription_data: { metadata: { user_id: userId } },
    });

    return res.json({ success: true, url: session.url });
  } catch (err) {
    return res.status(502).json({ success: false, error: 'Could not start checkout. Please try again.' });
  }
});

/**
 * POST /billing/portal
 * Creates a Stripe Billing Portal session so the user can manage/cancel their subscription.
 */
router.post('/portal', authRequire, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ success: false, error: 'Billing not configured.' });

  const userId = req.cookies.userId;

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return res.status(404).json({ success: false, error: 'No billing account found.' });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${process.env.APP_URL ?? 'http://localhost:5173'}/profile`,
  });

  return res.json({ success: true, url: session.url });
});

/**
 * POST /billing/webhook  (raw body — registered before express.json() in app.js)
 * Handles Stripe webhook events to keep profiles.plan in sync.
 */
router.post('/webhook', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.sendStatus(503);

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  const obj = event.data.object;

  // Resolve the app user for subscription events: prefer the metadata we stamped
  // on the subscription, fall back to the row we already have. Guards against
  // events arriving before checkout.session.completed wrote the row.
  async function resolveUserId() {
    if (obj.metadata?.user_id) return obj.metadata.user_id;
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', obj.id)
      .maybeSingle();
    return data?.user_id ?? null;
  }

  try {
  switch (event.type) {
    case 'checkout.session.completed': {
      // Link the Stripe customer to the user and create/update the subscription row
      const userId = obj.metadata?.user_id ?? obj.client_reference_id;
      if (!userId) break;

      const stripeSubId = obj.subscription;
      const customerId  = obj.customer;

      const stripeSub = stripeSubId
        ? await stripe.subscriptions.retrieve(stripeSubId)
        : null;

      await supabaseAdmin.from('subscriptions').upsert({
        user_id:                  userId,
        stripe_customer_id:       customerId,
        stripe_subscription_id:   stripeSubId ?? null,
        stripe_price_id:          stripeSub?.items?.data?.[0]?.price?.id ?? null,
        status:                   stripeSub?.status ?? 'active',
        plan:                     'plus',
        current_period_end:       stripeSub?.current_period_end
                                    ? new Date(stripeSub.current_period_end * 1000).toISOString()
                                    : null,
        cancel_at_period_end:     stripeSub?.cancel_at_period_end ?? false,
        updated_at:               new Date().toISOString(),
      }, { onConflict: 'user_id' });

      await supabaseAdmin.from('profiles').update({ plan: 'plus' }).eq('user_id', userId);
      break;
    }

    case 'customer.subscription.updated': {
      // Active OR trialing OR past_due keeps Plus — past_due means Stripe is still
      // retrying payment; we only drop to Free on a real cancel/unpaid terminal state.
      const isActive = ['active', 'trialing', 'past_due'].includes(obj.status);
      const plan = isActive ? 'plus' : 'free';
      const userId = await resolveUserId();

      if (userId) {
        await supabaseAdmin.from('subscriptions').update({
          status:               obj.status,
          plan,
          current_period_end:   obj.current_period_end
                                  ? new Date(obj.current_period_end * 1000).toISOString()
                                  : null,
          cancel_at_period_end: obj.cancel_at_period_end ?? false,
          updated_at:           new Date().toISOString(),
        }).eq('user_id', userId);

        await supabaseAdmin.from('profiles').update({ plan }).eq('user_id', userId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const userId = await resolveUserId();

      if (userId) {
        await supabaseAdmin.from('subscriptions').update({
          status:     'cancelled',
          plan:       'free',
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);

        await supabaseAdmin.from('profiles').update({ plan: 'free' }).eq('user_id', userId);
      }
      break;
    }

    default:
      break;
  }
  } catch (err) {
    // Return 500 so Stripe retries delivery rather than dropping the event.
    return res.status(500).json({ received: false });
  }

  return res.json({ received: true });
});

export default router;
