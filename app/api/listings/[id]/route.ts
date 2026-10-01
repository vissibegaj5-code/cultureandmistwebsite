import { database, failure } from '../../../../db';
import { getChatGPTUser } from '../../../chatgpt-auth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Sign in first' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json() as { status?: string };
    if (!['active','withdrawn'].includes(body.status || '')) return Response.json({ error: 'Invalid status' }, { status: 400 });
    const result = await database().prepare("UPDATE listings SET status = ? WHERE id = ? AND seller_id = ? AND status IN ('active','withdrawn')").bind(body.status,id,user.userId).run();
    if (!result.meta.changes) return Response.json({ error: 'Listing not found' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
