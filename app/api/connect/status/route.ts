import { database } from '../../../../db';
import { retrieveStripeAccount, StripeApiError } from '../../../../lib/stripe-connect';
import { getChatGPTUser } from '../../../chatgpt-auth';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ connected: false, ready: false }, { status: 401 });

  try {
    const account = await database().prepare(
      'SELECT stripe_account_id FROM stripe_accounts WHERE seller_id = ?',
    ).bind(user.userId).first<{ stripe_account_id: string }>();
    if (!account) return Response.json({ connected: false, ready: false });

    const stripeAccount = await retrieveStripeAccount(account.stripe_account_id);
    const status = stripeAccount.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? 'pending';
    return Response.json({ connected: true, ready: status === 'active', status });
  } catch (error) {
    console.error('Stripe connected account status unavailable:', error);
    return Response.json({
      error: 'Could not check Stripe onboarding status.',
      code: error instanceof StripeApiError ? error.code : 'stripe_status_unavailable',
    }, { status: 502 });
  }
}