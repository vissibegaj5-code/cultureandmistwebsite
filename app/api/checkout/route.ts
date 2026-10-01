import { env } from 'cloudflare:workers';
import { database } from '../../../db';
import {
  createCheckoutSession,
  expireCheckoutSession,
  retrieveStripeAccount,
} from '../../../lib/stripe-connect';
import { getChatGPTUser } from '../../chatgpt-auth';

type Listing = {
  id: string;
  seller_id: string;
  title: string;
  price_cents: number;
  status: string;
};

async function releaseReservation(orderId: string, listingId: string, status: string) {
  const db = database();
  await db.batch([
    db.prepare("UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'")
      .bind(status, orderId),
    db.prepare("UPDATE listings SET status = 'active' WHERE id = ? AND status = 'reserved'")
      .bind(listingId),
  ]);
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Sign in to purchase this listing.' }, { status: 401 });

  let orderId: string | undefined;
  let listingId: string | undefined;
  let sessionId: string | undefined;
  try {
    const body = await request.json() as { listingId?: unknown };
    if (typeof body.listingId !== 'string' || body.listingId.length > 80) {
      return Response.json({ error: 'Choose a valid listing.' }, { status: 400 });
    }

    const db = database();
    const listing = await db.prepare(
      "SELECT id, seller_id, title, price_cents, status FROM listings WHERE id = ? AND status = 'active'",
    ).bind(body.listingId).first<Listing>();
    if (!listing) return Response.json({ error: 'This listing is no longer available.' }, { status: 409 });
    if (listing.seller_id === user.userId) {
      return Response.json({ error: 'You cannot purchase your own listing.' }, { status: 400 });
    }

    const sellerAccount = await db.prepare(
      'SELECT stripe_account_id FROM stripe_accounts WHERE seller_id = ?',
    ).bind(listing.seller_id).first<{ stripe_account_id: string }>();
    if (!sellerAccount) {
      return Response.json({ error: 'The seller has not finished Stripe payout setup.' }, { status: 409 });
    }

    const stripeAccount = await retrieveStripeAccount(sellerAccount.stripe_account_id);
    const transferStatus = stripeAccount.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
    if (transferStatus !== 'active') {
      return Response.json({ error: 'The seller must finish Stripe verification before checkout.' }, { status: 409 });
    }

    const reservation = await db.prepare(
      "UPDATE listings SET status = 'reserved' WHERE id = ? AND status = 'active'",
    ).bind(listing.id).run();
    if (!reservation.meta.changes) {
      return Response.json({ error: 'This listing is already being purchased.' }, { status: 409 });
    }

    orderId = crypto.randomUUID();
    listingId = listing.id;
    await db.prepare(
      'INSERT INTO orders (id, listing_id, buyer_id, seller_id, amount_cents, status, payment_reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(orderId, listing.id, user.userId, listing.seller_id, listing.price_cents, 'pending', null, new Date().toISOString()).run();

    const form = new URLSearchParams();
    const origin = new URL(request.url).origin;
    form.set('mode', 'payment');
    form.set('success_url', `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    form.set('cancel_url', `${origin}/?checkout=cancelled`);
    form.set('client_reference_id', orderId);
    form.set('line_items[0][price_data][currency]', 'usd');
    form.set('line_items[0][price_data][product_data][name]', listing.title);
    form.set('line_items[0][price_data][unit_amount]', String(listing.price_cents));
    form.set('line_items[0][quantity]', '1');
    form.set('shipping_address_collection[allowed_countries][0]', 'US');
    form.set('payment_intent_data[transfer_data][destination]', sellerAccount.stripe_account_id);
    const feePercent = Number(env.STRIPE_APPLICATION_FEE_PERCENT ?? '2');
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) {
      throw new Error('STRIPE_APPLICATION_FEE_PERCENT must be between 0 and 100.');
    }
    const applicationFee = Math.round(listing.price_cents * feePercent / 100);
    if (applicationFee > 0) {
      form.set('payment_intent_data[application_fee_amount]', String(applicationFee));
    }
    form.set('metadata[order_id]', orderId);
    form.set('metadata[listing_id]', listing.id);

    const session = await createCheckoutSession(form, orderId);
    sessionId = session.id;
    await db.prepare(
      "UPDATE orders SET payment_reference = ? WHERE id = ? AND status = 'pending'",
    ).bind(session.id, orderId).run();
    return Response.json({ url: session.url });
  } catch (error) {
    if (sessionId) {
      try { await expireCheckoutSession(sessionId); } catch (expireError) {
        console.error('Could not expire an unlinked Stripe Checkout Session:', expireError);
      }
    }
    if (orderId && listingId) {
      try { await releaseReservation(orderId, listingId, 'failed'); } catch (releaseError) {
        console.error('Could not release a failed checkout reservation:', releaseError);
      }
    }
    console.error('Could not start Stripe Checkout:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Checkout is temporarily unavailable.' },
      { status: 502 },
    );
  }
}