import { database } from '../../../../db';
import { createStripeAccount, createStripeOnboardingLink } from '../../../../lib/stripe-connect';
import { getChatGPTUser } from '../../../chatgpt-auth';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Sign in to connect a payout account.' }, { status: 401 });

  try {
    const db = database();
    let account = await db.prepare(
      'SELECT stripe_account_id FROM stripe_accounts WHERE seller_id = ?',
    ).bind(user.userId).first<{ stripe_account_id: string }>();

    if (!account) {
      const created = await createStripeAccount(user.email, user.displayName, user.userId);
      await db.prepare(
        'INSERT OR IGNORE INTO stripe_accounts (seller_id, stripe_account_id, created_at) VALUES (?, ?, ?)',
      ).bind(user.userId, created.id, new Date().toISOString()).run();
      account = await db.prepare(
        'SELECT stripe_account_id FROM stripe_accounts WHERE seller_id = ?',
      ).bind(user.userId).first<{ stripe_account_id: string }>();
    }

    if (!account) throw new Error('Could not save the connected account.');
    const url = await createStripeOnboardingLink(account.stripe_account_id, new URL(request.url).origin);
    return Response.json({ url });
  } catch (error) {
    console.error('Stripe seller onboarding could not start:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Stripe onboarding is unavailable.' },
      { status: 502 },
    );
  }
}