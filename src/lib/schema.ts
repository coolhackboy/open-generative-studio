import type { Category, FieldSchema, Variant } from '../types/catalog';

/**
 * Turns a variant's JSON-schema-ish input definition into UI controls, defaults,
 * validation and the final `input` payload.
 */

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export interface MediaField {
  name: string;
  kind: MediaKind;
  label: string;
  multiple: boolean;
  min: number;
  max: number;
  required: boolean;
  description?: string;
}

export type Control =
  | { kind: 'enum'; options: (string | number | boolean)[] }
  | { kind: 'range'; min: number; max: number; step: number }
  | { kind: 'number'; integer: boolean; min?: number; max?: number }
  | { kind: 'boolean' }
  | { kind: 'text' };

export interface ParamField {
  name: string;
  label: string;
  control: Control;
  required: boolean;
  default?: unknown;
  description?: string;
}

export type Params = Record<string, unknown>;

const PROMPT_FIELD = 'prompt';

const LABELS: Record<string, string> = {
  n: 'Images',
  num_images: 'Images',
  aspect_ratio: 'Aspect',
  size: 'Size',
  resolution: 'Resolution',
  duration: 'Duration',
  generate_audio: 'Audio',
  enable_safety_checker: 'Safety checker',
  output_format: 'Format',
  negative_prompt: 'Negative prompt',
  seed: 'Seed',
  image_url: 'Image',
  video_url: 'Video',
  audio_url: 'Audio',
  reference_image_urls: 'Reference images',
  reference_video_urls: 'Reference videos',
  reference_audio_urls: 'Reference audio',
  reference_file_urls: 'Reference files',
  last_frame_url: 'Last frame',
  first_frame_url: 'First frame',
  end_image_url: 'End frame',
};

/** Fields shown directly in the composer (in this order) when present. */
const PRIMARY = ['aspect_ratio', 'size', 'resolution', 'duration', 'n', 'num_images', 'quality', 'mode'];
const MAX_PRIMARY = 4;

export function humanize(name: string): string {
  if (LABELS[name]) return LABELS[name];
  const s = name.replace(/_urls?$/, '').replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isMediaField(name: string, f: FieldSchema): boolean {
  if (f.media) return true;
  if (f.type === 'string' && f.format === 'uri') return name !== 'callback_url';
  if (f.type === 'array' && f.items?.format === 'uri') return true;
  return false;
}

function mediaKind(name: string, f: FieldSchema): MediaKind {
  if (f.media) return f.media;
  if (/video/.test(name)) return 'video';
  if (/audio|music|voice/.test(name)) return 'audio';
  if (/image|frame|photo|mask/.test(name)) return 'image';
  return 'file';
}

export function getMediaFields(variant: Variant, category: Category): MediaField[] {
  const { properties, required } = variant.schema;
  return Object.entries(properties)
    .filter(([name, f]) => isMediaField(name, f))
    .map(([name, f]) => {
      const multiple = f.type === 'array';
      const isRequired = required.includes(name);
      let label = humanize(name);
      if (name === 'image_urls') label = category === 'video' ? 'Frames' : 'Images';
      return {
        name,
        kind: mediaKind(name, f),
        label,
        multiple,
        min: multiple ? (f.minItems ?? (isRequired ? 1 : 0)) : isRequired ? 1 : 0,
        max: multiple ? (f.maxItems ?? 10) : 1,
        required: isRequired,
        description: f.description,
      };
    });
}

function controlFor(f: FieldSchema): Control | null {
  if (f.enum && f.enum.length > 0) return { kind: 'enum', options: f.enum };
  switch (f.type) {
    case 'boolean':
      return { kind: 'boolean' };
    case 'integer':
    case 'number': {
      const integer = f.type === 'integer';
      if (f.minimum != null && f.maximum != null && f.maximum - f.minimum <= 1000) {
        const span = f.maximum - f.minimum;
        const step = integer ? 1 : span <= 2 ? 0.05 : span <= 20 ? 0.1 : 1;
        return { kind: 'range', min: f.minimum, max: f.maximum, step };
      }
      return { kind: 'number', integer, min: f.minimum, max: f.maximum };
    }
    case 'string':
      return { kind: 'text' };
    default:
      return null; // objects / non-media arrays are not editable in the composer
  }
}

/** Editable non-prompt, non-media fields. Unsupported fields (objects, arrays) are skipped. */
export function getParamFields(variant: Variant): ParamField[] {
  const { properties, required } = variant.schema;
  const out: ParamField[] = [];
  for (const [name, f] of Object.entries(properties)) {
    if (name === PROMPT_FIELD || isMediaField(name, f)) continue;
    const control = controlFor(f);
    if (!control) continue;
    out.push({
      name,
      label: humanize(name),
      control,
      required: required.includes(name),
      default: f.default,
      description: f.description,
    });
  }
  return out;
}

/** Splits param fields into the ones shown inline and the "More" overflow. */
export function splitParamFields(fields: ParamField[]): { primary: ParamField[]; more: ParamField[] } {
  const rank = (f: ParamField) => {
    const p = PRIMARY.indexOf(f.name);
    if (f.required && f.control.kind !== 'text') return p === -1 ? 50 : p;
    if (p !== -1) return 100 + p;
    return 1000;
  };
  const sorted = [...fields].sort((a, b) => rank(a) - rank(b));
  const primary = sorted.filter((f) => rank(f) < 1000 && f.control.kind !== 'text').slice(0, MAX_PRIMARY);
  const more = sorted.filter((f) => !primary.includes(f));
  return { primary, more };
}

/** Unsupported required fields (e.g. required arrays of objects) the composer cannot fill. */
export function getUnsupportedRequired(variant: Variant): string[] {
  const { properties, required } = variant.schema;
  return required.filter((name) => {
    const f = properties[name];
    if (!f || name === PROMPT_FIELD || isMediaField(name, f)) return false;
    return controlFor(f) === null;
  });
}

export function hasPrompt(variant: Variant): boolean {
  return PROMPT_FIELD in variant.schema.properties;
}

export function defaultValue(field: ParamField): unknown {
  if (field.default !== undefined) return field.default;
  if (!field.required) return undefined;
  const c = field.control;
  switch (c.kind) {
    case 'enum':
      return c.options[0];
    case 'range':
      return c.min;
    case 'number':
      return c.min ?? (c.integer ? 1 : 0);
    case 'boolean':
      return false;
    case 'text':
      return undefined;
  }
}

/** Defaults merged with `saved`, restricted to fields the variant knows and valid values. */
export function initialParams(variant: Variant, saved?: Params): Params {
  const out: Params = {};
  for (const field of getParamFields(variant)) {
    const candidate = saved?.[field.name];
    if (candidate !== undefined && isValidValue(field, candidate)) {
      out[field.name] = candidate;
      continue;
    }
    const d = defaultValue(field);
    if (d !== undefined) out[field.name] = d;
  }
  return out;
}

function isValidValue(field: ParamField, value: unknown): boolean {
  const c = field.control;
  switch (c.kind) {
    case 'enum':
      return c.options.includes(value as string | number | boolean);
    case 'range':
      return typeof value === 'number' && value >= c.min && value <= c.max;
    case 'number':
      return (
        typeof value === 'number' &&
        (c.min == null || value >= c.min) &&
        (c.max == null || value <= c.max)
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'text':
      return typeof value === 'string';
  }
}

export function formatParamValue(field: ParamField, value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Auto';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (field.name === 'duration' && typeof value === 'number') return `${value}s`;
  if ((field.name === 'n' || field.name === 'num_images') && typeof value === 'number') return `×${value}`;
  return String(value);
}

export interface BuildArgs {
  variant: Variant;
  prompt: string;
  params: Params;
  media: Record<string, string[]>;
}

/** Builds the exact `input` payload, including only fields the schema declares. */
export function buildInput({ variant, prompt, params, media }: BuildArgs): Record<string, unknown> {
  const { properties } = variant.schema;
  const input: Record<string, unknown> = {};
  if (PROMPT_FIELD in properties && prompt.trim()) input[PROMPT_FIELD] = prompt.trim();
  for (const field of getParamFields(variant)) {
    const v = params[field.name];
    if (v === undefined || v === null || v === '') continue;
    input[field.name] = v;
  }
  for (const [name, f] of Object.entries(properties)) {
    if (!isMediaField(name, f)) continue;
    const urls = media[name] ?? [];
    if (urls.length === 0) continue;
    input[name] = f.type === 'array' ? urls : urls[0];
  }
  return input;
}

/** Client-side validation. Returns human-readable problems (empty = ok). */
export function validateInput(variant: Variant, category: Category, input: Record<string, unknown>): string[] {
  const { properties, required } = variant.schema;
  const problems: string[] = [];
  const mediaFields = new Map(getMediaFields(variant, category).map((m) => [m.name, m]));

  for (const name of required) {
    const v = input[name];
    const missing = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (!missing) continue;
    if (name === PROMPT_FIELD) problems.push('Write a prompt first.');
    else if (mediaFields.has(name)) {
      const m = mediaFields.get(name)!;
      const noun = m.kind === 'file' ? 'file' : m.kind;
      const count = m.min > 1 ? `at least ${m.min} ${noun}s` : `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`;
      problems.push(`Add ${count} for “${m.label}”.`);
    } else if (properties[name] && controlFor(properties[name]) === null) {
      problems.push(`“${humanize(name)}” isn't editable here yet — use “Copy as code” to send it via the API.`);
    } else problems.push(`“${humanize(name)}” is required.`);
  }

  for (const [name, value] of Object.entries(input)) {
    const f = properties[name];
    if (!f) continue;
    if (Array.isArray(value)) {
      const label = mediaFields.get(name)?.label ?? humanize(name);
      if (f.minItems != null && value.length < f.minItems) problems.push(`“${label}” needs at least ${f.minItems}.`);
      if (f.maxItems != null && value.length > f.maxItems) problems.push(`“${label}” allows at most ${f.maxItems}.`);
    } else if (typeof value === 'number') {
      if (f.minimum != null && value < f.minimum) problems.push(`“${humanize(name)}” must be ≥ ${f.minimum}.`);
      if (f.maximum != null && value > f.maximum) problems.push(`“${humanize(name)}” must be ≤ ${f.maximum}.`);
    } else if (typeof value === 'string') {
      if (f.maxLength != null && value.length > f.maxLength)
        problems.push(`“${humanize(name)}” is too long (max ${f.maxLength.toLocaleString()} characters).`);
    }
  }
  return problems;
}

/** Parses "16:9", "9:16", "1024x768" or "landscape_16_9" into width / height. */
export function parseAspect(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const m = value.match(/(\d+(?:\.\d+)?)\s*[:x×_]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return undefined;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? w / h : undefined;
}

export function estimateAspect(category: Category, input: Record<string, unknown>): number {
  return (
    parseAspect(input.aspect_ratio) ??
    parseAspect(input.size) ??
    parseAspect(input.image_size) ??
    (category === 'video' ? 16 / 9 : 1)
  );
}
