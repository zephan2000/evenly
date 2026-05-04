// POST /api/extract — fetches a receipt image from Supabase Storage by path,
// runs it through the AI extractor, returns the parsed PersistedExpense.
// Does NOT persist; the user edits the returned data and POSTs to /api/expenses.

import { extractReceipt } from '@/lib/ai/extract';
import { getJwtFromRequest } from '@/lib/auth/server';
import { createUserClient } from '@/lib/db/server';

export async function POST(request: Request) {
  const auth = getJwtFromRequest(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error.kind }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const path = (body as { receipt_path?: unknown })?.receipt_path;
  if (typeof path !== 'string' || !path.includes('/')) {
    return Response.json({ ok: false, error: 'receipt_path_required' }, { status: 400 });
  }

  const client = createUserClient(auth.jwt);

  const { data: blob, error: dlError } = await client.storage.from('receipts').download(path);
  if (dlError || !blob) {
    return Response.json(
      { ok: false, error: 'download_failed', detail: dlError?.message ?? 'no body' },
      { status: 404 },
    );
  }

  const arrayBuf = await blob.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString('base64');
  const mime = blob.type || 'image/png';
  const dataUrl = `data:${mime};base64,${base64}`;

  const result = await extractReceipt({ imageDataUrl: dataUrl });
  if (!result.ok) {
    const status =
      result.error.kind === 'missing_api_key'
        ? 500
        : result.error.kind === 'provider_unavailable'
          ? 502
          : 422;
    return Response.json(result, { status });
  }
  return Response.json(result, { status: 200 });
}
