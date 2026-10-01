import { env } from 'cloudflare:workers';

export function database(): D1Database {
  if (!env.DB) throw new Error('Marketplace data is temporarily unavailable');
  return env.DB;
}

export function bucket(): R2Bucket {
  if (!env.BUCKET) throw new Error('Image storage is temporarily unavailable');
  return env.BUCKET;
}

export function failure(error: unknown) {
  console.error('Marketplace request failed', error);
  return Response.json({ error: 'The marketplace is temporarily unavailable. Please try again.' }, { status: 503 });
}
