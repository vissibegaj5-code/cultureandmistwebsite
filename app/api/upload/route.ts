import { bucket, failure } from '../../../db';
import { getChatGPTUser } from '../../chatgpt-auth';

const types = new Set(['image/jpeg','image/png','image/webp']);
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Sign in to upload photos' }, { status: 401 });
  try {
    const data = await request.formData();
    const file = data.get('photo');
    if (!(file instanceof File) || !types.has(file.type) || file.size > 5_000_000 || file.size < 100) return Response.json({ error: 'Choose a JPG, PNG, or WebP image under 5 MB.' }, { status: 400 });
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const key = `${user.userId}/${crypto.randomUUID()}.${ext}`;
    await bucket().put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return Response.json({ key, url: `/api/photo/${key}` }, { status: 201 });
  } catch (error) { return failure(error); }
}
