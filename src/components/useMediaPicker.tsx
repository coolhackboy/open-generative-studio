import { useCallback, useRef } from 'react';
import type { MediaField, MediaKind } from '../lib/schema';
import { addFiles } from '../lib/tasks';

const ACCEPT: Record<MediaKind, string> = {
  image: 'image/jpeg,image/png,image/gif,image/webp',
  video: 'video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska',
  audio: 'audio/*',
  file: 'image/jpeg,image/png,image/gif,image/webp,video/*,audio/*',
};

/** One hidden file input shared by the attach button and the required-slot placeholders. */
export function useMediaPicker() {
  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<MediaField | null>(null);
  const pick = useCallback((f: MediaField) => {
    targetRef.current = f;
    const input = inputRef.current;
    if (!input) return;
    input.accept = ACCEPT[f.kind];
    input.multiple = f.multiple;
    input.click();
  }, []);
  const input = (
    <input
      ref={inputRef}
      type="file"
      className="hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        if (e.target.files?.length) addFiles(e.target.files, targetRef.current?.name);
        e.target.value = '';
      }}
    />
  );
  return { pick, input };
}

