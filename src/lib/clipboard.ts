import { toast } from '../ui';

export async function copyText(text: string, what = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error('Copy failed', 'Your browser blocked clipboard access.');
  }
}
