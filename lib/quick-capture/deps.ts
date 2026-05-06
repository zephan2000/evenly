// Real OrchestratorDeps for Quick capture (M1.5).
//
// Wraps fetch calls to the existing M1 endpoints:
//   - POST /api/upload   (multipart) — Supabase Storage
//   - POST /api/extract  (json)      — AI extraction
//   - POST /api/expenses (json)      — save_expense_with_items RPC
//
// Auth: caller passes a `getToken()` that returns the Clerk JWT. We don't
// import Clerk hooks here so the module stays plain TS and unit-testable.
//
// Save dep needs trip + member context that the picker doesn't provide today.
// Until that wiring lands, callers either: (a) pass `saveContext` to enable
// real saves, or (b) leave it null to get a clear "not wired" rejection.

import { Platform } from 'react-native';

import type { OrchestratorDeps } from './orchestrator';

export type GetToken = () => Promise<string | null>;

export type SaveContext = {
  /** UUID of the trip the expense belongs to. */
  tripId: string;
  /** UUID of the member paying for the expense (typically the current user). */
  payerMemberId: string;
  /** UUID of the member who created the entry (typically the current user). */
  createdByMemberId: string;
};

export type CreateRealDepsArgs = {
  getToken: GetToken;
  /** Trip id used for the upload path. Required — uploads need a trip. */
  uploadTripId: string;
  /** Optional. Provide to enable real saves; omit to fail fast with a clear error. */
  saveContext?: SaveContext;
  /** Override the API base — defaults to relative paths (works with Expo Router web). */
  apiBase?: string;
};

export function createRealDeps({
  getToken,
  uploadTripId,
  saveContext,
  apiBase = '',
}: CreateRealDepsArgs): OrchestratorDeps {
  return {
    async uploadImage(imageUri) {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const form = new FormData();
      form.append('trip_id', uploadTripId);
      // RN's FormData accepts `{uri, name, type}` as a file part at runtime;
      // TS DOM types don't model this, so we cast at the boundary.
      const part = await uriToFormDataPart(imageUri);
      form.append('file', part as unknown as Blob);

      const res = await fetch(`${apiBase}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form as unknown as BodyInit,
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; path: string }
        | { ok: false; error: string }
        | null;
      if (!res.ok || !json || json.ok !== true) {
        const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
        throw new Error(`upload_failed: ${msg}`);
      }
      return { uploadedKey: json.path };
    },

    async extractReceipt(uploadedKey) {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`${apiBase}/api/extract`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ receipt_path: uploadedKey }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: import('@/lib/ai/schema').PersistedExpense }
        | { ok: false; error: { kind: string; detail?: string } }
        | null;
      if (!res.ok || !json || json.ok !== true) {
        const msg =
          json && 'error' in json
            ? typeof json.error === 'object'
              ? `${json.error.kind}${json.error.detail ? `: ${json.error.detail}` : ''}`
              : json.error
            : `HTTP ${res.status}`;
        throw new Error(`extract_failed: ${msg}`);
      }
      // PersistedExpense has tax_mode in {inclusive, exclusive}; ExtractedExpense
      // (DraftExpense.extracted) accepts {inclusive, exclusive, none}. The
      // server already collapses 'none' → 'exclusive' before persisting, so the
      // reverse is a no-op widening.
      return { extracted: json.data };
    },

    async saveExpense(draft) {
      if (!saveContext) {
        throw new Error(
          'save_not_wired: Quick capture save requires SaveContext (tripId, payerMemberId, createdByMemberId). ' +
            'Wire trip-member resolution before enabling bulk save.',
        );
      }
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      if (!draft.extracted) throw new Error('save_failed: no extracted data');

      const ext = draft.extracted;
      // Server enforces persisted tax_mode ∈ {inclusive, exclusive}. If the AI
      // returned 'none', collapse to 'exclusive' with zero amounts (the user
      // intent is "no tax line was extracted").
      const persistedTaxMode: 'inclusive' | 'exclusive' =
        ext.tax_mode === 'none' ? 'exclusive' : ext.tax_mode;

      const res = await fetch(`${apiBase}/api/expenses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trip_id: saveContext.tripId,
          payer_member_id: saveContext.payerMemberId,
          created_by_member_id: saveContext.createdByMemberId,
          receipt_image_path: draft.uploadedKey,
          expense: { ...ext, tax_mode: persistedTaxMode },
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; expense_id: string }
        | { ok: false; error: string }
        | null;
      if (!res.ok || !json || json.ok !== true) {
        const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
        throw new Error(`save_failed: ${msg}`);
      }
      return { expenseId: json.expense_id };
    },
  };
}

// ─── URI → FormData payload (cross-platform) ─────────────────────────────

type RNFilePart = { uri: string; name: string; type: string };

async function uriToFormDataPart(uri: string): Promise<File | RNFilePart> {
  if (Platform.OS === 'web') {
    // On web the URI is a blob:/data:/http URL. fetch + Blob → File.
    const res = await fetch(uri);
    const blob = await res.blob();
    const name = inferName(uri);
    const type = blob.type || inferMimeFromUri(uri) || 'image/jpeg';
    return new File([blob], name, { type });
  }
  // iOS / Android: FormData.append accepts a {uri, name, type} object as the
  // file part. The TS DOM type doesn't match, so callers cast at the boundary.
  return {
    uri,
    name: inferName(uri),
    type: inferMimeFromUri(uri) ?? 'image/jpeg',
  };
}

function inferName(uri: string): string {
  const m = /[/\\]([^/\\?#]+)(?:\?|#|$)/.exec(uri);
  return m?.[1] ?? `receipt-${Date.now()}.jpg`;
}

function inferMimeFromUri(uri: string): string | null {
  const m = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(uri);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return null;
}
