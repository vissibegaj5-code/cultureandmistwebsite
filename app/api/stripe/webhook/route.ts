import { database } from '../../../../db';
import { verifyStripeSignature } from '../../../../lib/stripe-connect';

type CheckoutSessionEvent = {
  id: string;
  payment_status?: string;
  client_reference_id?: string;
  metadata?: { order_id?: string };
};

type StripeEvent = {
  type: string;
  data?: { object?: CheckoutSessionEvent };
};

async function settleOrder(orderId: string, sessionId: string) {
  const db = database();
  await db.batch([
    db.prepare("UPDATE orders SET status = 'paid', payment_reference = COALESCE(payment_reference, ?) WHERE id = ? AND status = 'pending' AND (payment_reference IS NULL OR payment_reference = ?)")
      .bind(sessionId, orderId, sessionId),
    db.prepare("UPDATE listings SET status = 'sold' WHERE status = 'reserved' AND id = (SELECT listing_id FROM orders WHERE id = ? AND status = 'paid')")
      .bind(orderId),
  ]);
}

async function releaseOrder(orderId: string, sessionId: string, status: 'expired' | 'failed') {
  const db = database();
  await db.batch([
    db.prepare("UPDATE orders SET status = ?, payment_reference = COALESCE(payment_reference, ?) WHERE id = ? AND status = 'pending' AND (payment_reference IS NULL OR payment_reference = ?)")
      .bind(status, sessionId, orderId, sessionId),
    db.prepare("UPDATE listings SET status = 'active' WHERE status = 'reserved' AND id = (SELECT listing_id FROM orders WHERE id = ? AND status = ?)")
      .bind(orderId, status),
  ]);
}

export async function POST(request: Request) {
  const payload = new Uint8Array(await request.arrayBuffer());
  const verified = await verifyStripeSignature(payload, request.headers.get('stripe-signature'));
  if (!verified) return Response.json({ error: 'Invalid Stripe webhook signature.' }, { status: 400 });

  let event: StripeEvent;
  try {
    event = JSON.parse(new TextDecoder().decode(payload)) as StripeEvent;
  } catch {
    return Response.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }

  const session = event.data?.object;
  const orderId = session?.metadata?.order_id ?? session?.client_reference_id;
  if (session && orderId) {
    try {
      if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && session.payment_status === 'paid') {
        await settleOrder(orderId, session.id);
      } else if (event.type === 'checkout.session.expired') {
        await releaseOrder(orderId, session.id, 'expired');
      } else if (event.type === 'checkout.session.async_payment_failed') {
        await releaseOrder(orderId, session.id, 'failed');
      }
    } catch (error) {
      console.error('Could not apply Stripe webhook to marketplace order:', error);
      return Response.json({ error: 'Could not update the marketplace order.' }, { status: 500 });
    }
  }

  return Response.json({ received: true });
}