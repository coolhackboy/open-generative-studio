import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, ChevronDown, Code2, Info, Upload } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { estimateCost, formatUSD, isUsageBilled, startingPriceLabel } from '../lib/cost';
import { modKey } from '../lib/format';
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
import { Button, Chip, cn, Dialog, Kbd, Popover, Tooltip } from '../ui';
import { CodeTabs } from './CodeTabs';
import { AttachButton, MediaTray } from './MediaTray';
import { ModelThumb } from './ModelThumb';
import { MoreParams, ParamChip } from './ParamControls';

function ModelButton({ model }: { model: CatalogModel }) {
  const setOpen = useUI((s) => s.setPaletteOpen);
  return (
    <Tooltip label={<span className="inline-flex items-center gap-1">Switch model · {modKey} K</span>} side="top">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Model: ${model.name}. Change model`}
        className="inline-flex h-8 max-w-[220px] shrink-0 items-center gap-2 rounded-sm border border-line-strong bg-surface-2 pr-2 pl-1 text-[13px] font-medium text-fg transition-colors hover:bg-surface-3"
      >
        <ModelThumb model={model} className="size-6 rounded-xs" />
        <span className="truncate">{model.name}</span>
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
        active={open}
        value={variant.label}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown size={13} className="text-fg-subtle" />
      </Chip>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} label="Variant" className="w-[240px] p-1.5">
        <div className="px-2 pt-1 pb-1.5 text-xs font-medium tracking-[0.02em] text-fg-subtle ">Variant</div>
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
                'flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2',
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

function CostLabel({ variant, input, model }: { variant: Variant; input: Record<string, unknown>; model: CatalogModel }) {
  const est = useMemo(() => estimateCost(variant, input), [variant, input]);
  if (est) {
    return (
      <Tooltip label={`${est.label} · ${est.credits} credits`} side="top">
        <span tabIndex={0} className="rounded-xs font-mono text-xs text-fg-muted tabular-nums">
          ≈ {formatUSD(est.usd)}
        </span>
      </Tooltip>
    );
  }
  if (isUsageBilled(variant))
    return <span className="text-xs whitespace-nowrap text-fg-subtle">Billed by usage</span>;
  const from = startingPriceLabel({ ...model, variants: [variant] });
  return (
    <Tooltip label="Price depends on input length" side="top">
      <span tabIndex={0} className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-fg-subtle">
        <Info size={12} />
        {from ?? 'Varies'}
      </span>
    </Tooltip>
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

export function Composer() {
  const { model, variant } = useCurrentModel();
  const prompt = useComposer((s) => s.prompt);
  const setPrompt = useComposer((s) => s.setPrompt);
  const params = useComposer((s) => s.params);
  const setParam = useComposer((s) => s.setParam);
  const media = useComposer((s) => s.media);
  const submitting = useComposer((s) => s.submitting);
  const apiBase = useSettings((s) => s.apiBase);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [codeOpen, setCodeOpen] = useState(false);

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

  const dragging = useFileDrop(mediaFields.length > 0);

  if (!model || !variant) return null;
  const promptEnabled = hasPrompt(variant);

  return (
    <>
      <section aria-label="Create" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center sm:px-4 sm:pb-5">
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.1 }}
          className={cn(
            'glass pointer-events-auto w-full border-t border-line-strong shadow-lg max-sm:bg-surface sm:max-w-[880px] sm:rounded-lg sm:border',
            'pb-[env(safe-area-inset-bottom)] sm:pb-0',
          )}
          onDragOver={(e) => e.preventDefault()}
        >
          <MediaTray fields={mediaFields} />

          <label htmlFor="prompt-input" className="sr-only">
            Prompt
          </label>
          <textarea
            id="prompt-input"
            ref={taRef}
            rows={1}
            value={prompt}
            disabled={!promptEnabled}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              promptEnabled
                ? model.category === 'video'
                  ? 'Describe the video you want to create…'
                  : 'Describe the image you want to create…'
                : `${model.name} doesn't use a prompt — add references instead.`
            }
            className="thin-scrollbar block max-h-[220px] min-h-[52px] w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-base leading-6 text-fg sm:text-[15px] outline-none placeholder:text-fg-subtle focus-visible:outline-none disabled:cursor-not-allowed"
          />

          {unsupported.length > 0 && (
            <p className="mx-3 mb-2 flex items-start gap-1.5 rounded-sm bg-warning/10 px-2.5 py-1.5 text-xs leading-4 text-warning">
              <Info size={12} className="mt-0.5 shrink-0" />
              This variant requires {unsupported.map((n) => `“${humanize(n)}”`).join(', ')}, which the composer can’t edit
              yet. Use the code button to send it via the API.
            </p>
          )}

          <div className="flex items-center gap-2 px-2.5 pb-2.5">
            <div className="no-scrollbar -my-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 pr-4 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
              <ModelButton model={model} />
              <VariantPicker model={model} variant={variant} />
              <AttachButton fields={mediaFields} />
              {primary.map((f) => (
                <ParamChip key={f.name} field={f} value={params[f.name]} onChange={(v) => setParam(f.name, v)} />
              ))}
              <MoreParams fields={more} params={params} onChange={setParam} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden sm:inline-flex">
                <CostLabel variant={variant} input={input} model={model} />
              </span>
              <Tooltip label="Copy as code" side="top">
                <button
                  type="button"
                  aria-label="Copy current settings as code"
                  onClick={() => setCodeOpen(true)}
                  className="hidden size-8 items-center justify-center rounded-sm text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg sm:inline-flex"
                >
                  <Code2 size={16} />
                </button>
              </Tooltip>
              <Button
                variant="primary"
                onClick={() => void generate()}
                loading={submitting}
                aria-label="Generate"
                aria-keyshortcuts="Control+Enter Meta+Enter"
                className="h-9 rounded-sm px-2.5 sm:px-3.5"
                icon={<ArrowUp size={16} strokeWidth={2.25} />}
              >
                <span className="hidden sm:inline">Generate</span>
                <span className="ml-0.5 hidden items-center gap-0.5 opacity-60 lg:inline-flex">
                  <span className="font-mono text-xs">{modKey}↵</span>
                </span>
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line px-3 py-1.5 sm:hidden">
            <CostLabel variant={variant} input={input} model={model} />
            <span className="text-xs text-fg-subtle">{model.category === 'video' ? 'Video' : 'Image'}</span>
          </div>
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
              <p className="text-[15px] font-medium text-fg">
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

      <Dialog
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        title="Copy as code"
        description={`The exact request this composer would send for ${model.name}${model.variants.length > 1 ? ` · ${variant.label}` : ''}.`}
        size="lg"
      >
        <div className="px-5 pb-5">
          <CodeTabs baseUrl={apiBase} model={variant.model} input={codeInput} />
          <div className="mt-2 text-xs text-fg-subtle">
            Local files you attached are uploaded first; their hosted URLs appear in the snippet once uploads finish.{' '}
            <Kbd>Esc</Kbd> to close.
          </div>
        </div>
      </Dialog>
    </>
  );
}
