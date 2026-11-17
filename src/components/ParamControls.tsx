import { SlidersHorizontal, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { formatParamValue, parseAspect, type ParamField, type Params } from '../lib/schema';
import { Chip, Input, Popover, Segmented, Slider, Toggle } from '../ui';

type Value = string | number | boolean | undefined;

function AspectGlyph({ value }: { value: unknown }) {
  const r = parseAspect(value);
  if (!r) return null;
  const w = r >= 1 ? 14 : Math.max(5, 14 * r);
  const h = r >= 1 ? Math.max(5, 14 / r) : 14;
  return (
    <span className="inline-flex size-3.5 items-center justify-center" aria-hidden="true">
      <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: w, height: h }} />
    </span>
  );
}

const isAspectField = (name: string) => /aspect|^size$|image_size|(^|_)ratio$/.test(name);

/** Full editor for one field (used inside popovers and the "More" panel). */
export function FieldEditor({
  field,
  value,
  onChange,
  compact,
}: {
  field: ParamField;
  value: unknown;
  onChange: (v: unknown) => void;
  compact?: boolean;
}) {
  const c = field.control;
  switch (c.kind) {
    case 'enum': {
      const aspect = isAspectField(field.name);
      const options: { value: Value; label: ReactNode; title?: string }[] = c.options.map((o) => ({
        value: o,
        title: String(o),
        label: (
          <>
            {aspect && <AspectGlyph value={o} />}
            {field.name === 'duration' && typeof o === 'number' ? `${o}s` : String(o)}
          </>
        ),
      }));
      if (!field.required && field.default === undefined) options.unshift({ value: undefined, label: 'Auto', title: 'Auto' });
      const many = options.length > 4 || options.some((o) => String(o.title ?? '').length > 10);
      return (
        <Segmented<Value>
          label={field.label}
          options={options}
          value={value as Value}
          onChange={onChange}
          layout={many ? 'grid' : 'row'}
          size={compact ? 'sm' : 'md'}
          className={many ? 'w-full' : undefined}
        />
      );
    }
    case 'range':
      return (
        <Slider
          label={field.label}
          min={c.min}
          max={c.max}
          step={c.step}
          value={typeof value === 'number' ? value : c.min}
          onChange={onChange}
          format={(v) => formatParamValue(field, v)}
        />
      );
    case 'number':
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode={c.integer ? 'numeric' : 'decimal'}
            aria-label={field.label}
            min={c.min}
            max={c.max}
            step={c.integer ? 1 : 'any'}
            placeholder={field.required ? '' : 'Auto'}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') return onChange(undefined);
              const n = Number(raw);
              if (Number.isFinite(n)) onChange(c.integer ? Math.round(n) : n);
            }}
            className="font-mono"
          />
          {field.name === 'seed' && (
            <button
              type="button"
              onClick={() => onChange(Math.floor(Math.random() * 2_147_483_647))}
              className="h-9 shrink-0 rounded-sm border border-line px-2.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              Random
            </button>
          )}
        </div>
      );
    case 'boolean':
      return <Toggle label={field.label} checked={Boolean(value)} onChange={onChange} />;
    case 'text':
      return (
        <Input
          aria-label={field.label}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.default !== undefined ? String(field.default) : 'Optional'}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        />
      );
  }
}

/** One inline chip in the composer toolbar. Booleans toggle directly; others open a popover. */
export function ParamChip({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const display = formatParamValue(field, value);

  if (field.control.kind === 'boolean') {
    return (
      <Chip
        role="switch"
        aria-checked={Boolean(value)}
        aria-label={field.label}
        active={Boolean(value)}
        label={field.label}
        value={display}
        onClick={() => onChange(!value)}
      />
    );
  }

  return (
    <>
      <Chip
        ref={ref}
        aria-haspopup="dialog"
        aria-expanded={open}
        active={open}
        icon={isAspectField(field.name) ? <AspectGlyph value={value} /> : undefined}
        label={isAspectField(field.name) && parseAspect(value) ? undefined : field.label}
        value={display}
        title={field.label}
        onClick={() => setOpen((o) => !o)}
      />
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={ref}
        label={field.label}
        className={field.control.kind === 'enum' && field.control.options.length > 4 ? 'w-[300px]' : 'min-w-[240px]'}
      >
        {field.control.kind !== 'range' && (
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-fg">{field.label}</span>
          </div>
        )}
        <FieldEditor
          field={field}
          value={value}
          onChange={(v) => {
            onChange(v);
            if (field.control.kind === 'enum') setOpen(false);
          }}
        />
        {field.description && (
          <p className="mt-2.5 line-clamp-3 max-w-[300px] text-2xs leading-4 text-fg-subtle">{field.description}</p>
        )}
      </Popover>
    </>
  );
}

/** "More" popover listing all overflow fields. */
export function MoreParams({
  fields,
  params,
  onChange,
}: {
  fields: ParamField[];
  params: Params;
  onChange: (name: string, v: unknown) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (fields.length === 0) return null;
  const changed = fields.filter((f) => params[f.name] !== undefined && params[f.name] !== f.default).length;
  return (
    <>
      <Chip
        ref={ref}
        aria-haspopup="dialog"
        aria-expanded={open}
        active={open}
        icon={<SlidersHorizontal size={14} />}
        label="More"
        onClick={() => setOpen((o) => !o)}
      >
        {changed > 0 && (
          <span className="inline-flex size-4 items-center justify-center rounded-full bg-accent-soft font-mono text-2xs text-accent">
            {changed}
          </span>
        )}
      </Chip>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} label="More settings" align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-xs font-medium text-fg">More settings</span>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="rounded-xs p-1 text-fg-subtle hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>
        <div className="thin-scrollbar flex max-h-[min(60dvh,520px)] flex-col gap-4 overflow-y-auto p-4">
          {fields.map((f) =>
            f.control.kind === 'boolean' ? (
              <div key={f.name} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[13px] text-fg">{f.label}</div>
                  {f.description && <div className="mt-0.5 line-clamp-2 text-2xs leading-4 text-fg-subtle">{f.description}</div>}
                </div>
                <FieldEditor field={f} value={params[f.name]} onChange={(v) => onChange(f.name, v)} />
              </div>
            ) : (
              <div key={f.name} className="flex flex-col gap-1.5">
                {f.control.kind !== 'range' && <div className="text-[13px] text-fg">{f.label}</div>}
                <FieldEditor field={f} value={params[f.name]} onChange={(v) => onChange(f.name, v)} compact />
                {f.description && f.control.kind !== 'range' && (
                  <div className="line-clamp-2 text-2xs leading-4 text-fg-subtle">{f.description}</div>
                )}
              </div>
            ),
          )}
        </div>
      </Popover>
    </>
  );
}
