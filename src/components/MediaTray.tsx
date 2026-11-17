import { AnimatePresence, motion } from 'motion/react';
import { AudioLines, FileIcon, Film, ImagePlus, Paperclip, RotateCcw, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { MediaField, MediaKind } from '../lib/schema';
import { useComposer, type MediaItem } from '../lib/store';
import { addFiles, retryUpload } from '../lib/tasks';
import { Chip, cn, Popover, Tooltip } from '../ui';

const ACCEPT: Record<MediaKind, string> = {
  image: 'image/jpeg,image/png,image/gif,image/webp',
  video: 'video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska',
  audio: 'audio/*',
  file: 'image/jpeg,image/png,image/gif,image/webp,video/*,audio/*',
};

const KIND_ICON: Record<MediaKind, typeof ImagePlus> = { image: ImagePlus, video: Film, audio: AudioLines, file: FileIcon };

function Thumb({ item, label }: { item: MediaItem; label: string }) {
  const remove = useComposer((s) => s.removeMedia);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.18 }}
      className="group relative size-14 shrink-0"
    >
      <Tooltip label={item.status === 'error' ? (item.error ?? 'Upload failed') : `${label} · ${item.name}`} side="top">
        <div
          className={cn(
            'relative size-14 overflow-hidden rounded-sm bg-surface-3 ring-1',
            item.status === 'error' ? 'ring-danger/60' : 'ring-line-strong',
          )}
        >
          {item.kind === 'image' ? (
            <img src={item.previewUrl} alt={item.name} className="size-full object-cover" />
          ) : item.kind === 'video' ? (
            <video src={item.previewUrl} muted playsInline preload="metadata" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-fg-muted">
              <AudioLines size={18} />
            </div>
          )}
          {item.status === 'uploading' && (
            <div className="absolute inset-0 flex items-end bg-black/45">
              <div className="h-0.5 w-full bg-white/20">
                <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${item.progress}%` }} />
              </div>
            </div>
          )}
          {item.status === 'error' && (
            <button
              type="button"
              aria-label={`Retry upload of ${item.name}`}
              onClick={() => retryUpload(item.id)}
              className="absolute inset-0 flex items-center justify-center bg-black/55 text-white"
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      </Tooltip>
      <button
        type="button"
        aria-label={`Remove ${item.name}`}
        onClick={() => remove(item.id)}
        className="absolute -top-1.5 -right-1.5 z-10 inline-flex size-5 items-center justify-center rounded-full border border-line-strong bg-surface text-fg-muted opacity-100 shadow-md transition-opacity hover:text-fg sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
      >
        <X size={11} />
      </button>
    </motion.div>
  );
}

/** Thumbnails of attached references, grouped by target field. */
export function MediaTray({ fields }: { fields: MediaField[] }) {
  const media = useComposer((s) => s.media);
  if (media.length === 0) return null;
  const groups = fields
    .map((f) => ({ field: f, items: media.filter((m) => m.field === f.name) }))
    .filter((g) => g.items.length > 0);
  return (
    <div className="no-scrollbar flex gap-4 overflow-x-auto px-3 pt-3 pb-1">
      {groups.map(({ field, items }) => (
        <div key={field.name} className="flex shrink-0 flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-subtle">
            {field.label}{' '}
            <span className="font-mono">
              {items.length}/{field.max}
            </span>
          </span>
          <div className="flex gap-2 pt-1 pr-1.5">
            <AnimatePresence initial={false}>
              {items.map((m) => (
                <Thumb key={m.id} item={m} label={field.label} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      ))}
    </div>
  );
}

/** "Add" button: opens the file picker directly, or a menu when the model has several media inputs. */
export function AttachButton({ fields }: { fields: MediaField[] }) {
  const media = useComposer((s) => s.media);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [target, setTarget] = useState<MediaField | null>(null);

  if (fields.length === 0) return null;

  const missingRequired = fields.some((f) => f.required && media.filter((m) => m.field === f.name).length < f.min);

  const pick = (f: MediaField) => {
    setTarget(f);
    setMenu(false);
    if (inputRef.current) {
      inputRef.current.accept = ACCEPT[f.kind];
      inputRef.current.multiple = f.multiple;
      inputRef.current.click();
    }
  };

  return (
    <>
      <Tooltip label={missingRequired ? 'Reference required' : 'Add reference (or drop / paste)'}>
        <Chip
          ref={anchorRef}
          aria-label="Add reference media"
          aria-haspopup={fields.length > 1 ? 'dialog' : undefined}
          active={menu}
          className={cn(missingRequired && 'border-dashed border-accent/60 text-fg')}
          icon={<Paperclip size={14} />}
          onClick={() => (fields.length === 1 ? pick(fields[0]) : setMenu((m) => !m))}
        >
          {missingRequired && <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />}
        </Chip>
      </Tooltip>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files, target?.name);
          e.target.value = '';
        }}
      />
      <Popover open={menu} onClose={() => setMenu(false)} anchorRef={anchorRef} label="Add reference" className="w-[300px] p-1.5">
        <div className="px-2 pt-1 pb-2 text-xs font-medium tracking-[0.02em] text-fg-subtle ">Add reference</div>
        <div className="flex flex-col">
          {fields.map((f) => {
            const Icon = KIND_ICON[f.kind];
            const count = media.filter((m) => m.field === f.name).length;
            const full = count >= f.max;
            return (
              <button
                key={f.name}
                type="button"
                disabled={full}
                onClick={() => pick(f)}
                className="flex items-start gap-3 rounded-sm px-2 py-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-40"
              >
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-sm bg-surface-3 text-fg-muted">
                  <Icon size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13px] text-fg">
                    {f.label}
                    {f.required && (
                      <span className="rounded-xs bg-accent-soft px-1 text-xs font-medium text-accent-ink">Required</span>
                    )}
                    <span className="ml-auto font-mono text-xs text-fg-subtle">
                      {count}/{f.max}
                    </span>
                  </span>
                  {f.description && (
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-fg-subtle">{f.description}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
