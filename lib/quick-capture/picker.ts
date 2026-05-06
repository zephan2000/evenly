// Multi-image picker for Quick capture (M1.5).
//
// Spec §5.1: 1–8 images per batch. The OS picker enforces selectionLimit; we
// truncate defensively in case the platform ignores it.

import * as ImagePicker from 'expo-image-picker';

import { MAX_BATCH_IMAGES } from './state';

export type PickedImage = {
  uri: string;
  /** Defaults to a generated name if the picker doesn't provide one. */
  fileName: string;
  /** MIME type, best-effort inferred from the picker payload. */
  mimeType: string;
};

export type PickerResult =
  | { kind: 'cancelled' }
  | { kind: 'permission_denied' }
  | { kind: 'success'; images: PickedImage[]; truncated: boolean };

/**
 * Open the OS image picker in multi-select mode and return up to 8 images.
 *
 * Surface a permission denial, picker cancellation, and >8 truncation
 * distinctly so the caller can route to the right UX (toast, modal, no-op).
 */
export async function pickReceiptImages(): Promise<PickerResult> {
  // Media-library permission is required on iOS; on Android it's the
  // photos permission. Request once per session; persists in the OS until
  // revoked.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { kind: 'permission_denied' };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: MAX_BATCH_IMAGES,
    quality: 0.85,
    exif: false,
    base64: false,
  });

  if (result.canceled) return { kind: 'cancelled' };

  const all = result.assets ?? [];
  const truncated = all.length > MAX_BATCH_IMAGES;
  const sliced = truncated ? all.slice(0, MAX_BATCH_IMAGES) : all;

  return {
    kind: 'success',
    truncated,
    images: sliced.map((a, i) => ({
      uri: a.uri,
      fileName: a.fileName ?? `receipt-${Date.now()}-${i}.jpg`,
      mimeType: a.mimeType ?? inferMimeFromUri(a.uri) ?? 'image/jpeg',
    })),
  };
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
