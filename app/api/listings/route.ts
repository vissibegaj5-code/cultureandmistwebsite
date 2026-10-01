import { database, failure } from '../../../db';
import { getChatGPTUser } from '../../chatgpt-auth';

const categories = new Set(['Clothing', 'Shoes', 'Accessories', 'Fragrance', 'Decants', 'Bottles']);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const user = await getChatGPTUser();
    const mine = url.searchParams.get('mine') === '1';
    if (mine && !user) return Response.json({ error: 'Sign in to see your listings' }, { status: 401 });
    const db = database();
    const rows = mine
      ? await db.prepare('SELECT id, seller_id, seller_name, title, brand, category, condition, description, price_cents, image_key, status, created_at FROM listings WHERE seller_id = ? ORDER BY created_at DESC LIMIT 100').bind(user!.userId).all()
      : await db.prepare("SELECT id, seller_id, seller_name, title, brand, category, condition, description, price_cents, image_key, status, created_at FROM listings WHERE status = 'active' ORDER BY created_at DESC LIMIT 100").all();
    return Response.json({ listings: rows.results });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Sign in to sell' }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const title = String(body.title || '').trim().slice(0, 100);
    const brand = String(body.brand || '').trim().slice(0, 60);
    const category = String(body.category || '');
    const condition = String(body.condition || '').trim().slice(0, 50);
    const description = String(body.description || '').trim().slice(0, 2000);
    const priceCents = Math.round(Number(body.price) * 100);
    const imageKey = String(body.imageKey || '');
    if (!title || !brand || !condition || !description || !categories.has(category) || !Number.isSafeInteger(priceCents) || priceCents < 100 || priceCents > 10000000 || !imageKey.startsWith(`${user.userId}/`)) return Response.json({ error: 'Complete all fields and upload a photo.' }, { status: 400 });
    const id = crypto.randomUUID();
    await database().prepare('INSERT INTO listings (id,seller_id,seller_name,seller_email,title,brand,category,condition,description,price_cents,image_key,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user.userId,user.displayName,user.email,title,brand,category,condition,description,priceCents,imageKey,'active',new Date().toISOString()).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) { return failure(error); }
}
