import type { Generation } from './types';

function filename(url: string, gen?: Generation): string {
  const ext = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? (gen?.category === 'video' ? 'mp4' : 'png');
  const slug = (gen?.prompt || gen?.modelName || 'generation')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${slug || 'generation'}.${ext}`;
}

/** Download via blob (works cross-origin when CORS allows), else open in a new tab. */
export async function downloadFile(url: string, gen?: Generation): Promise<void> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename(url, gen);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}
