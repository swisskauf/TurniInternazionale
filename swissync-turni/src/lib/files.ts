import { Capacitor } from '@capacitor/core';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Saves a generated file. On iOS/Android it is written to the cache and handed to the share
 * sheet (Save to Files, Mail, WhatsApp…); on the web it is downloaded.
 */
export async function saveFile(blob: Blob, fileName: string, opts: { share?: boolean; title?: string } = {}): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const data = await blobToBase64(blob);
    const res = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
    await Share.share({ title: opts.title ?? fileName, url: res.uri, dialogTitle: opts.title ?? fileName });
    return;
  }
  if (opts.share && typeof navigator !== 'undefined' && 'canShare' in navigator) {
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: opts.title ?? fileName });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function canShareFiles(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

export function pickFile(accept: string, capture?: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
