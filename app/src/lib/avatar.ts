import { supabase } from './supabase';

/** Ein Pfad pro Nutzer – Upload ersetzt die Datei, URLs bleiben stabil. */
export function avatarStoragePath(userId: string) {
  return `${userId}/avatar.jpg`;
}

export function withAvatarCacheBuster(url: string, version?: string | number | null) {
  const base = url.split('?')[0];
  const v = version ?? Date.now();
  return `${base}?v=${encodeURIComponent(String(v))}`;
}

/**
 * Lädt ein Profilbild hoch und liefert eine anzeigbare URL.
 * Nutzt zuerst die öffentliche URL; falls der Bucket privat ist, eine Signed URL.
 */
export async function uploadProfileAvatar(userId: string, localUri: string): Promise<string> {
  const path = avatarStoragePath(userId);

  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error('Bild konnte nicht gelesen werden');
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength < 100) {
    throw new Error('Bilddatei ist leer oder ungültig');
  }

  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
    cacheControl: '3600',
  });

  if (uploadError) {
    throw uploadError;
  }

  const version = Date.now();
  const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
  const publicUrl = withAvatarCacheBuster(publicData.publicUrl, version);

  try {
    const probe = await fetch(publicUrl.split('?')[0], { method: 'HEAD' });
    if (probe.ok) {
      return publicUrl;
    }
  } catch {
    // Bucket vermutlich nicht öffentlich → Signed URL
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('avatars')
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  if (signError || !signed?.signedUrl) {
    throw signError ?? new Error('Profilbild-URL konnte nicht erzeugt werden');
  }

  return withAvatarCacheBuster(signed.signedUrl, version);
}

/** Für <Image source={{ uri }} /> – Cache-Buster aus Profil-timestamp. */
export function resolveAvatarDisplayUri(
  avatarUrl: string | null | undefined,
  version?: string | null,
): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.includes('?v=')) {
    return avatarUrl;
  }
  return withAvatarCacheBuster(avatarUrl, version ?? null);
}
