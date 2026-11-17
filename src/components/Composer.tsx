import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUp, ChevronDown, Code2, Info, SlidersHorizontal, Upload } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { estimateCost, formatUSD, isUsageBilled, startingPriceLabel } from '../lib/cost';
import { modKey } from '../lib/format';
import { getPresets } from '../lib/presets';
import {
  buildInput,
  getMediaFields,
  getParamFields,
  getUnsupportedRequired,
  hasPrompt,
  humanize,
  splitParamFields,
} from '../lib/schema';
import { useComposer, useCurrentModel, useSettings, useUI } from '../lib/store';
import { addFiles, generate, kindOfFile } from '../lib/tasks';
import type { CatalogModel, Variant } from '../types/catalog';
import { Chip, cn, Dialog, Kbd, Popover, Shake, Spinner, Tooltip, useMediaQuery } from '../ui';
import { CodeTabs } from './CodeTabs';
import { AttachButton, MediaTray } from './MediaTray';
import { useMediaPicker } from './useMediaPicker';
import { ProviderIcon } from './ModelThumb';
import { FieldEditor, MoreParams, ParamChip } from './ParamControls';

// ---------------------------------------------------------------- pieces

function ModelButton({ model, fill }: { model: CatalogModel; fill?: boolean }) {
  const setOpen = useUI((s) => s.setPaletteOpen);
  const shown = model;
  return (
    <Tooltip
      label={<span className="inline-flex items-center gap-1">Switch model · {modKey} K</span>}
      side="top"
      className={fill ? 'min-w-0 flex-1' : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Model: ${model.name}. Change model`}
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-2 rounded-sm border border-line-strong bg-surface-2 pr-2 pl-1 text-sm font-medium text-fg transition-colors hover:bg-surface-3 max-sm:h-11',
          fill ? 'w-full min-w-0' : 'max-w-[240px]',
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={shown.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <ProviderIcon model={shown} />
            <span className="truncate">{shown.name}</span>
          </motion.span>
        </AnimatePresence>
        <ChevronDown size={14} className="shrink-0 text-fg-subtle" />
      </button>
    </Tooltip>
  );
}

function VariantPicker({ model, variant }: { model: CatalogModel; variant: Variant }) {
  const setVariant = useComposer((s) => s.setVariant);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (model.variants.length < 2) return null;
  return (
    <>
      <Chip
        ref={ref}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Variant: ${variant.label}`}
        active={open}
        value={variant.label}
        onClick={() => setOpen((o) => !o)}
        className="max-sm:h-11"
      >
        <ChevronDown size={13} className="text-fg-subtle" />
      </Chip>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} label="Variant" className="w-[260px] p-1.5">
        <div className="label px-2 pt-1 pb-1.5">Variant</div>
        <div role="radiogroup" aria-label="Variant" className="flex flex-col">
          {model.variants.map((v) => (
            <button
              key={v.model}
              type="button"
              role="radio"
              aria-checked={v.model === variant.model}
              onClick={() => {
                setVariant(v.model);
                setOpen(false);
              }}
              className={cn(
                'flex items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-surface-2',
                v.model === variant.model ? 'text-fg' : 'text-fg-muted',
              )}
            >
              <span>{v.label}</span>
              <span className="truncate font-mono text-xs text-fg-subtle">{v.model}</span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

/** Smoothly tweens a dollar amount (160ms). */
function TweenUSD({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (reduce || prev.current === value) {
      prev.current = value;
      setShown(value);
      return;
    }
    const controls = animate(prev.current, value, { duration: 0.16, ease: 'easeOut', onUpdate: setShown });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <>{formatUSD(shown)}</>;
}

/** Price hint when there's no exact estimate (usage-billed or input-length dependent). */
function PriceHint({ variant, model }: { variant: Variant; model: CatalogModel }) {
  if (isUsageBilled(variant)) return <span className="text-xs whitespace-nowrap text-fg-subtle">Billed by usage</span>;
  const from = startingPriceLabel({ ...model, variants: [variant] });
  return (
    <Tooltip label="Price depends on input length" side="top">
      <span tabIndex={0} className="inline-flex items-center gap-1 rounded-xs text-xs whitespace-nowrap text-fg-subtle">
        <Info size={12} />
        {from ?? 'Varies'}
      </span>
    </Tooltip>
  );
}

/** Toolbar group; groups after the first carry a hairline divider that also reads well when wrapped. */
function Group({ children, label, divider }: { children: ReactNode; label: string; divider?: boolean }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'flex shrink-0 items-center gap-1.5 transition-opacity duration-200',
        divider && 'sm:border-l sm:border-line-strong sm:pl-2',
      )}
    >
      {children}
    </div>
  );
}

function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [ref, value]);
}

/** Global drag & drop + paste of files into the composer. */
function useFileDrop(enabled: boolean) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (enabled && e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => kindOfFile(f));
      if (files.length === 0) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, [enabled]);
  return dragging;
}

// ---------------------------------------------------------------- animated placeholder

const TYPE_MS = 35;
const HOLD_MS = 1800;
const DELETE_MS = 15;

/**
 * Types real example prompts into the placeholder as a muted ghost hint
 * ("Seedance 2.5 Flash · A cinematic…"). DOM-only (no re-render per character), never touches
 * the real model, chips or price, and is truncated to two lines on narrow screens.
 */
function useTypewriter(ref: React.RefObject<HTMLTextAreaElement | null>, enabled: boolean, fallback: string): void {
  const presets = useMemo(() => getPresets().filter((p) => p.prompt.length <= 140), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled || presets.length === 0) {
      el.placeholder = fallback;
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let i = Math.floor(Math.random() * presets.length);
    const wait = (ms: number) => new Promise<void>((r) => (timer = setTimeout(r, ms)));
    // ~2 lines of characters for the current width (16px font ≈ 8px per char).
    const maxChars = () => Math.max(24, Math.floor((el.clientWidth - 24) / 8.2) * 2 - 2);
    const show = (text: string) => {
      const max = maxChars();
      el.placeholder = text.length > max ? `${text.slice(0, max - 1)}…` : text;
    };
    (async () => {
      await wait(600);
      while (!cancelled) {
        const p = presets[i % presets.length];
        const prefix = `${p.model.name} · `;
        for (let n = 1; n <= p.prompt.length && !cancelled; n++) {
          show(prefix + p.prompt.slice(0, n));
          await wait(TYPE_MS);
        }
        await wait(HOLD_MS);
        for (let n = p.prompt.length; n >= 0 && !cancelled; n--) {
          show(prefix + p.prompt.slice(0, n));
          await wait(DELETE_MS);
        }
        i++;
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      el.placeholder = fallback;
    };
  }, [ref, enabled, presets, fallback]);
}

// ---------------------------------------------------------------- composer

export function Composer() {
  const { model, variant } = useCurrentModel();
  const prompt = useComposer((s) => s.prompt);
  const setPrompt = useComposer((s) => s.setPrompt);
  const params = useComposer((s) => s.params);
  const setParam = useComposer((s) => s.setParam);
  const media = useComposer((s) => s.media);
  const submitting = useComposer((s) => s.submitting);
  const invalid = useComposer((s) => s.invalid);
  const apiBase = useSettings((s) => s.apiBase);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const narrow = useMediaQuery('(max-width: 639px)');
  // The placeholder preview stops for the session as soon as the user touches the composer.
  const [previewStopped, setPreviewStopped] = useState(false);
  const stopPreview = () => setPreviewStopped(true);
  const modelId = useComposer((s) => s.modelId);
  const firstModel = useRef(modelId);
  useEffect(() => {
    if (modelId !== firstModel.current) setPreviewStopped(true);
  }, [modelId]);
  const setVariant = useComposer((s) => s.setVariant);
  const reduce = useReducedMotion();
  const { pick, input: pickerInput } = useMediaPicker();
  const composerRef = useRef<HTMLDivElement>(null);

  // Expose the composer height so the page can keep content clear of it.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty('--composer-h', `${Math.round(el.getBoundingClientRect().height)}px`),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [model]);

  useAutoGrow(taRef, prompt);

  const mediaFields = useMemo(() => (model && variant ? getMediaFields(variant, model.category) : []), [model, variant]);
  const { primary, more } = useMemo(
    () => (variant ? splitParamFields(getParamFields(variant)) : { primary: [], more: [] }),
    [variant],
  );
  const unsupported = useMemo(() => (variant ? getUnsupportedRequired(variant) : []), [variant]);

  // Input for the cost estimate: count every attached item (even while uploading).
  const input = useMemo(() => {
    if (!variant) return {};
    const urls: Record<string, string[]> = {};
    for (const m of media) (urls[m.field] ??= []).push(m.url ?? m.previewUrl);
    return buildInput({ variant, prompt, params, media: urls });
  }, [variant, prompt, params, media]);
  // Input for "Copy as code": hosted URLs only — never local blob: previews.
  const codeInput = useMemo(() => {
    if (!variant) return {};
    const urls: Record<string, string[]> = {};
    for (const m of media) (urls[m.field] ??= []).push(m.url && !m.url.startsWith('blob:') ? m.url : `<uploading ${m.name}>`);
    return buildInput({ variant, prompt, params, media: urls });
  }, [variant, prompt, params, media]);

  const promptEnabled = variant ? hasPrompt(variant) : false;
  const fallbackPlaceholder = !model
    ? ''
    : promptEnabled
      ? model.category === 'video'
        ? 'Describe the video you want to create…'
        : 'Describe the image you want to create…'
      : `${model.name} doesn't use a prompt — add references instead.`;
  useTypewriter(
    taRef,
    !previewStopped && !reduce && !focused && !prompt && media.length === 0 && promptEnabled,
    fallbackPlaceholder,
  );

  const estimate = useMemo(() => (variant ? estimateCost(variant, input) : null), [variant, input]);

  const dragging = useFileDrop(mediaFields.length > 0);

  if (!model || !variant) return null;
  const moreInvalid = !!invalid && more.some((f) => f.name === invalid.field);
  const hasParams = primary.length > 0 || more.length > 0;

  const codeButton = (
    <Tooltip label="Copy as code" side="top">
      <button
        type="button"
        aria-label="Copy current settings as code"
        onClick={() => setCodeOpen(true)}
        className="inline-flex size-8 items-center justify-center rounded-sm text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Code2 size={16} />
      </button>
    </Tooltip>
  );

  const generateButton = (
    <Tooltip
      label={
        estimate ? (
          <span>
            {estimate.label} · {estimate.credits} credits
          </span>
        ) : (
          <span>Generate · {modKey}↵</span>
        )
      }
      side="top"
    >
      <button
        type="button"
        onClick={() => void generate()}
        disabled={submitting}
        aria-busy={submitting || undefined}
        aria-keyshortcuts="Control+Enter Meta+Enter"
        aria-label={estimate ? `Generate, about ${formatUSD(estimate.usd)}` : 'Generate'}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-sm bg-accent px-3 text-sm font-medium whitespace-nowrap text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition-[background-color,transform] duration-150 select-none hover:bg-accent-hover active:scale-[0.97] disabled:opacity-70 max-sm:h-11 sm:px-3.5"
      >
        {submitting ? <Spinner size={15} /> : <ArrowUp size={16} strokeWidth={2.25} />}
        <span className="hidden sm:inline">Generate</span>
        {estimate && (
          <span className="font-mono text-[13px] tabular-nums">
            <span className="hidden sm:inline">· </span>
            <TweenUSD value={estimate.usd} />
          </span>
        )}
      </button>
    </Tooltip>
  );

  /** References + settings for the selected model. */
  const controls = (wide: boolean) => (
    <div className={cn('flex items-center gap-1.5', wide ? 'flex-wrap sm:gap-x-2 sm:gap-y-2' : 'shrink-0')}>
      {mediaFields.length > 0 && (
        <Group label="References" divider={wide}>
          <AttachButton fields={mediaFields} onPick={pick} />
        </Group>
      )}
      {hasParams &&
        (wide ? (
          <Group label="Settings" divider>
            {primary.map((f) => (
              <Shake key={f.name} active={invalid?.field === f.name} nonce={invalid?.nonce}>
                <ParamChip field={f} value={params[f.name]} onChange={(v) => setParam(f.name, v)} />
              </Shake>
            ))}
            <Shake active={moreInvalid} nonce={invalid?.nonce}>
              <MoreParams fields={more} params={params} onChange={setParam} />
            </Shake>
          </Group>
        ) : (
          <Shake active={!!invalid && [...primary, ...more].some((f) => f.name === invalid.field)} nonce={invalid?.nonce}>
            <Chip
              aria-label="Settings"
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
              icon={<SlidersHorizontal size={16} />}
              className="h-11 px-3.5"
            />
          </Shake>
        ))}
    </div>
  );

  return (
    <>
      <section aria-label="Create" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center sm:px-4 sm:pb-5">
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.1 }}
          className={cn(
            'glass pointer-events-auto w-full border-t border-line-strong shadow-lg transition-[border-color,box-shadow] duration-200 max-sm:bg-surface sm:max-w-[960px] sm:rounded-lg sm:border',
            'focus-within:border-[color-mix(in_oklab,var(--accent)_55%,var(--line-strong))] sm:focus-within:shadow-[0_0_0_4px_var(--accent-soft),var(--shadow-lg)]',
            'pb-[env(safe-area-inset-bottom)] sm:pb-0',
          )}
          ref={composerRef}
          onDragOver={(e) => e.preventDefault()}
          onPointerDownCapture={stopPreview}
          onFocusCapture={stopPreview}
        >
          {pickerInput}
          <MediaTray fields={mediaFields} onPick={pick} />

          <label htmlFor="prompt-input" className="sr-only">
            Prompt
          </label>
          <Shake active={invalid?.field === 'prompt'} nonce={invalid?.nonce} block className="mx-1 mt-1 rounded-md">
            <textarea
              id="prompt-input"
              ref={taRef}
              rows={1}
              value={prompt}
              disabled={!promptEnabled}
              aria-invalid={invalid?.field === 'prompt' || undefined}
              onChange={(e) => setPrompt(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={fallbackPlaceholder}
              className="thin-scrollbar block max-h-[220px] min-h-[52px] w-full resize-none bg-transparent px-3 pt-2.5 pb-2 text-base leading-6 text-fg outline-none placeholder:text-fg-subtle focus-visible:outline-none disabled:cursor-not-allowed max-sm:text-[16px]"
            />
          </Shake>

          {unsupported.length > 0 && (
            <p className="mx-3 mb-2 flex items-start gap-1.5 rounded-sm bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
              <Info size={13} className="mt-0.5 shrink-0" />
              This variant requires {unsupported.map((n) => `“${humanize(n)}”`).join(', ')}, which the composer can’t edit
              yet. Use the code button to send it via the API.
            </p>
          )}

          {narrow ? (
            <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
              <ModelButton model={model} fill />
              {controls(false)}
              {generateButton}
            </div>
          ) : (
            <div className="flex items-end gap-2 px-2.5 pb-2.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-0.5 sm:gap-x-2 sm:gap-y-2">
                <Group label="Model">
                  <ModelButton model={model} />
                  <VariantPicker model={model} variant={variant} />
                </Group>
                {controls(true)}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!estimate && (
                  <span className="hidden sm:inline-flex">
                    <PriceHint variant={variant} model={model} />
                  </span>
                )}
                {codeButton}
                {generateButton}
              </div>
            </div>
          )}
          {!estimate && (
            <div className="flex items-center justify-between border-t border-line px-3 py-1.5 sm:hidden">
              <PriceHint variant={variant} model={model} />
              <span className="text-xs text-fg-subtle">{model.category === 'video' ? 'Video' : 'Image'}</span>
            </div>
          )}
        </motion.div>
      </section>

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-overlay p-6 backdrop-blur-sm"
          >
            <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-lg border-2 border-dashed border-accent/60 bg-surface/80 px-8 py-12 text-center">
              <Upload size={26} className="text-accent-ink" />
              <p className="text-base font-medium text-fg">
                {mediaFields.length > 0 ? 'Drop to add as reference' : `${model.name} doesn't take references`}
              </p>
              <p className="text-xs text-fg-muted">
                {mediaFields.length > 0
                  ? `${mediaFields.map((f) => f.label).join(' · ')} — JPEG, PNG, GIF, WebP; videos up to 100 MB`
                  : 'Pick a model that accepts images or videos.'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={sheetOpen} onClose={() => setSheetOpen(false)} title="Settings" description={model.name} size="md">
        <div className="thin-scrollbar flex flex-col gap-5 overflow-y-auto px-5 pt-1 pb-5">
          {model.variants.length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-fg">Variant</span>
              <div role="radiogroup" aria-label="Variant" className="flex flex-wrap gap-1.5">
                {model.variants.map((v) => (
                  <button
                    key={v.model}
                    type="button"
                    role="radio"
                    aria-checked={v.model === variant.model}
                    onClick={() => setVariant(v.model)}
                    className={cn(
                      'h-10 rounded-sm border px-3 text-sm',
                      v.model === variant.model ? 'border-line-strong bg-surface-3 text-fg' : 'border-line text-fg-muted',
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {[...primary, ...more].map((f) => (
            <Shake key={f.name} active={invalid?.field === f.name} nonce={invalid?.nonce} block className="rounded-md">
              <div className={cn('flex gap-2', f.control.kind === 'boolean' ? 'items-center justify-between' : 'flex-col')}>
                {f.control.kind !== 'range' && <span className="text-sm text-fg">{f.label}</span>}
                <FieldEditor field={f} value={params[f.name]} onChange={(v) => setParam(f.name, v)} />
              </div>
            </Shake>
          ))}
          <button
            type="button"
            onClick={() => {
              setSheetOpen(false);
              setCodeOpen(true);
            }}
            className="flex h-11 items-center justify-center gap-2 rounded-sm border border-line text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <Code2 size={16} /> Copy as code
          </button>
        </div>
      </Dialog>

      <Dialog
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        title="Copy as code"
        description={`The exact request this composer would send for ${model.name}${model.variants.length > 1 ? ` · ${variant.label}` : ''}.`}
        size="lg"
      >
        <div className="px-5 pb-5">
          <CodeTabs baseUrl={apiBase} model={variant.model} input={codeInput} defaultOpen />
          <div className="mt-2 text-xs text-fg-subtle">
            Attached files appear as their hosted URLs once uploaded. <Kbd>Esc</Kbd> to close.
          </div>
        </div>
      </Dialog>
    </>
  );
}
