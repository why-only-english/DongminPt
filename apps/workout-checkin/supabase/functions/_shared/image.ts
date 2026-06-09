export type DownloadedImage = {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
};

export async function downloadKakaoImage(url: string): Promise<DownloadedImage> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('image_url_must_be_https');

  const allowlist = (Deno.env.get('ALLOWED_IMAGE_HOSTS') ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
  if (!allowlist.length && Deno.env.get('APP_ENV') === 'production') {
    throw new Error('image_host_allowlist_required');
  }
  if (allowlist.length && !allowlist.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    throw new Error('image_host_not_allowed');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(parsed, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error('image_download_failed');
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? 'application/octet-stream';
    const maxBytes = Number(Deno.env.get('MAX_IMAGE_BYTES') ?? 10 * 1024 * 1024);
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > maxBytes) throw new Error('image_too_large');
    const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('heic') ? 'heic' : contentType.includes('heif') ? 'heif' : 'jpg';
    if (!['jpg', 'png', 'webp', 'heic', 'heif'].includes(extension)) throw new Error('unsupported_image_type');

    const reader = response.body?.getReader();
    if (!reader) throw new Error('image_download_failed');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('image_too_large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, mimeType: contentType, extension };
  } finally {
    clearTimeout(timeout);
  }
}
