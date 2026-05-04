// POST /api/upload — multipart upload of a receipt image to Supabase Storage.
// Path convention: receipts/{trip_id}/{uuid}.{ext}.
// RLS on storage.objects gates writes to the trip the user owns.

import { getJwtFromRequest } from '@/lib/auth/server';
import { createUserClient } from '@/lib/db/server';

const MAX_BYTES = 10 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = getJwtFromRequest(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error.kind }, { status: 401 });
  }

  // RN's ambient FormData lacks `get` (it's a write-only upload body type),
  // but at runtime in the Node server context Request.formData() returns the
  // Web standard FormData with `get`. Cast to a minimal structural shape.
  type WebForm = { get(name: string): string | Blob | null };
  const form = (await request.formData().catch(() => null)) as WebForm | null;
  if (!form) {
    return Response.json({ ok: false, error: 'invalid_form_data' }, { status: 400 });
  }

  const tripId = form.get('trip_id');
  const file = form.get('file');

  if (typeof tripId !== 'string' || !UUID_RE.test(tripId)) {
    return Response.json({ ok: false, error: 'trip_id_required' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: 'file_required' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return Response.json({ ok: false, error: 'image_required' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: 'file_too_large', limit: MAX_BYTES }, { status: 413 });
  }

  const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? 'bin';
  const key = `${tripId}/${crypto.randomUUID()}.${ext}`;

  const client = createUserClient(auth.jwt);
  const { error } = await client.storage.from('receipts').upload(key, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    return Response.json(
      { ok: false, error: 'upload_failed', detail: error.message },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, path: key }, { status: 200 });
}
