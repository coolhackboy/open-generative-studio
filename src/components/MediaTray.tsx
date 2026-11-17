import { AnimatePresence, motion } from 'motion/react';
import { AudioLines, FileIcon, Film, ImagePlus, Paperclip, Plus, RotateCcw, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { MediaField, MediaKind } from '../lib/schema';
import { useComposer, type MediaItem } from '../lib/store';
import { retryUpload } from '../lib/tasks';
import { Chip, cn, Popover, Shake, Tooltip } from '../ui';

const KIND_ICON: Record<MediaKind, typeof ImagePlus> = { image: ImagePlus, video: Film, audio: AudioLines, file: FileIcon };
const KIND_LABEL: Record<MediaKind, string> = { image: 'Image', video: 'Video', audio: 'Audio', file: 'File' };

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
        className="absolute -top-2 -right-2 z-10 inline-flex size-6 items-center justify-center rounded-full border border-line-strong bg-surface text-fg-muted shadow-md transition-opacity before:absolute before:-inset-2 before:content-[''] hover:text-fg sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </motion.div>
  );
}

/** Dashed placeholder for a required reference that's still missing. */
function RequiredSlot({ field, onPick }: { field: MediaField; onPick: (f: MediaField) => void }) {
  const invalid = useComposer((s) => s.invalid);
  const Icon = KIND_ICON[field.kind];
  return (
    <Shake active={invalid?.field === field.name} nonce={invalid?.nonce}>
      <button
        type="button"
        onClick={() => onPick(field)}
        aria-label={`Add ${KIND_LABEL[field.kind].toLowerCase()} for ${field.label} (required)`}
        className="flex size-14 flex-col items-center justify-center gap-0.5 rounded-sm border border-dashed border-line-strong text-fg-subtle transition-colors hover:border-accent hover:text-fg"
      >
        <Icon size={15} />
        <span className="text-[10px] leading-3 font-medium">{KIND_LABEL[field.kind]}</span>
        <span className="text-[10px] leading-3">required</span>
      </button>
    </Shake>
  );
}

/** Thumbnails of attached references grouped by target field, plus required placeholders. */
export function MediaTray({ fields, onPick }: { fields: MediaField[]; onPick: (f: MediaField) => void }) {
  const media = useComposer((s) => s.media);
  const groups = fields
    .map((f) => ({ field: f, items: media.filter((m) => m.field === f.name) }))
    .filter((g) => g.items.length > 0 || (g.field.required && g.items.length < g.field.min));
  if (groups.length === 0) return null;
  return (
    <div className="no-scrollbar flex gap-4 overflow-x-auto px-3 pt-3 pb-1">
      {groups.map(({ field, items }) => (
        <div key={field.name} className="flex shrink-0 flex-col gap-1.5">
          <span className="label">
            {field.label}{' '}
            <span className="font-mono">
              {items.length}/{field.max}
            </span>
          </span>
          <div className="flex gap-2 pt-1 pr-2">
            <AnimatePresence initial={false}>
              {items.map((m) => (
                <Thumb key={m.id} item={m} label={field.label} />
              ))}
            </AnimatePresence>
            {field.required && items.length < field.min && <RequiredSlot field={field} onPick={onPick} />}
            {items.length > 0 && items.length < field.max && field.multiple && (
              <button
                type="button"
                onClick={() => onPick(field)}
                aria-label={`Add another to ${field.label}`}
                className="flex size-14 items-center justify-center rounded-sm border border-dashed border-line text-fg-subtle transition-colors hover:border-line-strong hover:text-fg"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** "Add" button: opens the picker directly, or a menu when the model has several media inputs. */
export function AttachButton({ fields, onPick }: { fields: MediaField[]; onPick: (f: MediaField) => void }) {
  const media = useComposer((s) => s.media);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);

  if (fields.length === 0) return null;
  const total = media.length;

  return (
    <>
      <Tooltip label="Add references — or drop / paste files" side="top">
        <Chip
          ref={anchorRef}
          aria-label={`Add reference media${total ? ` (${total} attached)` : ''}`}
          aria-haspopup={fields.length > 1 ? 'dialog' : undefined}
          active={menu}
          icon={<Paperclip size={15} />}
          onClick={() => (fields.length === 1 ? onPick(fields[0]) : setMenu((m) => !m))}
          className="max-sm:h-11 max-sm:px-3.5"
        >
          {total > 0 && <span className="font-mono text-xs text-fg">{total}</span>}
        </Chip>
      </Tooltip>
      <Popover open={menu} onClose={() => setMenu(false)} anchorRef={anchorRef} label="Add reference" className="w-[320px] p-1.5">
        <div className="label px-2 pt-1 pb-2">Add reference</div>
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
                onClick={() => {
                  setMenu(false);
                  onPick(f);
                }}
                className="flex items-start gap-3 rounded-sm px-2 py-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-40"
              >
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-sm bg-surface-3 text-fg-muted">
                  <Icon size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm text-fg">
                    {f.label}
                    {f.required && (
                      <span className="rounded-xs bg-accent-soft px-1 text-xs font-medium text-accent-ink">Required</span>
                    )}
                    <span className="ml-auto font-mono text-xs text-fg-subtle">
                      {count}/{f.max}
                    </span>
                  </span>
                  {f.description && (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-fg-subtle">{f.description}</span>
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
