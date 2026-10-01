import { database } from '../../../../db';
import { createStripeOnboardingLink } from '../../../../lib/stripe-connect';
import { getChatGPTUser } from '../../../chatgpt-auth';

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.redirect(new URL('/?connect=signin', request.url), 303);

  try {
    const account = await database().prepare(
      'SELECT stripe_account_id FROM stripe_accounts WHERE seller_id = ?',
    ).bind(user.userId).first<{ stripe_account_id: string }>();
    if (!account) return Response.redirect(new URL('/?connect=missing', request.url), 303);

    const url = await createStripeOnboardingLink(account.stripe_account_id, new URL(request.url).origin);
    return Response.redirect(url, 303);
  } catch (error) {
    console.error('Stripe onboarding link refresh failed:', error);
    return Response.redirect(new URL('/?connect=error', request.url), 303);
  }
}