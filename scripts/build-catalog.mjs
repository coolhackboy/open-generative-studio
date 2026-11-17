#!/usr/bin/env node
/**
 * Builds src/data/catalog.json (see src/types/catalog.ts) from two git repos:
 *   - poyoapi: data/models.json        (model list, pricing, launch order)
 *   - docs:    api-manual/<series>/*.json (OpenAPI request schemas + examples)
 *
 * Files are read with `git cat-file` at a ref (default origin/main), so the published
 * versions are used and the working trees are never touched.
 *
 * Usage:   node scripts/build-catalog.mjs
 * Env:     POYOAPI_REPO (default C:/code/poyoapi), POYO_DOCS_REPO (default C:/code/docs),
 *          CATALOG_REF (default origin/main), CATALOG_OUT (default src/data/catalog.json)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POYOAPI_REPO = process.env.POYOAPI_REPO || 'C:/code/poyoapi';
const DOCS_REPO = process.env.POYO_DOCS_REPO || 'C:/code/docs';
const REF = process.env.CATALOG_REF || 'origin/main';
const OUT = path.resolve(ROOT, process.env.CATALOG_OUT || 'src/data/catalog.json');

const API_BASE = 'https://api.poyo.ai';
const DOCS_ORIGIN = 'https://docs.poyo.ai/';
const CATEGORY_MAP = { Image: 'image', Video: 'video' };
const DOC_SERIES = ['image-series', 'video-series'];
const MAX_DESC = 600;
const MAX_EXAMPLES = 8;

const warnings = []; // { id, reason }
const notes = []; // non-fatal per-variant notes

// ---------------------------------------------------------------- git helpers

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { maxBuffer: 1 << 28 }).toString('utf8');
}

/** Read many blobs in one `git cat-file --batch` call. Returns Map spec -> string|null. */
function readBlobs(repo, specs) {
  const res = spawnSync('git', ['-C', repo, 'cat-file', '--batch'], {
    input: specs.join('\n') + '\n',
    maxBuffer: 1 << 30,
  });
  if (res.status !== 0) throw new Error(`git cat-file failed: ${res.stderr}`);
  const buf = res.stdout;
  const out = new Map();
  let pos = 0;
  for (const spec of specs) {
    const nl = buf.indexOf(0x0a, pos);
    const header = buf.subarray(pos, nl).toString('utf8');
    pos = nl + 1;
    if (header.endsWith(' missing')) {
      out.set(spec, null);
      continue;
    }
    const size = Number(header.split(' ')[2]);
    out.set(spec, buf.subarray(pos, pos + size).toString('utf8'));
    pos += size + 1; // trailing LF
  }
  return out;
}

// ---------------------------------------------------------------- generic helpers

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function truncate(s, max = MAX_DESC) {
  if (typeof s !== 'string') return s;
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, '') + '…';
}

/** Drop undefined values; keep key order as inserted. */
function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function docUrlToPath(url) {
  if (typeof url !== 'string' || !url.startsWith(DOCS_ORIGIN)) return null;
  return url.slice(DOCS_ORIGIN.length).replace(/[#?].*$/, '').replace(/\/$/, '') + '.json';
}

// ---------------------------------------------------------------- OpenAPI helpers

function makeDeref(doc) {
  const lookup = (ref) => {
    if (!ref.startsWith('#/')) return undefined;
    let cur = doc;
    for (const part of ref.slice(2).split('/')) {
      cur = cur?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    return cur;
  };
  // Shallow deref (follows $ref chains at this level only).
  const deref = (node, seen = new Set()) => {
    while (isObj(node) && typeof node.$ref === 'string') {
      if (seen.has(node.$ref)) return {};
      seen.add(node.$ref);
      const { $ref, ...rest } = node;
      const target = lookup($ref);
      node = Object.keys(rest).length ? { ...target, ...rest } : target;
    }
    return node;
  };
  return deref;
}

/** Merge `allOf` branches that contribute properties (ignore pure constraints: not/if/then). */
function mergeObjectSchema(schema, deref) {
  schema = deref(schema);
  if (!isObj(schema)) return schema;
  if (!Array.isArray(schema.allOf)) return schema;
  const merged = { ...schema, properties: { ...(schema.properties || {}) }, required: [...(schema.required || [])] };
  for (const br0 of schema.allOf) {
    const br = mergeObjectSchema(br0, deref);
    if (!isObj(br) || !isObj(br.properties) || br.if || br.not) continue;
    Object.assign(merged.properties, br.properties);
    for (const r of br.required || []) if (!merged.required.includes(r)) merged.required.push(r);
  }
  return merged;
}

const modelIdsOf = (modelProp) => {
  if (!isObj(modelProp)) return [];
  if (Array.isArray(modelProp.enum)) return modelProp.enum.filter((x) => typeof x === 'string');
  if (typeof modelProp.const === 'string') return [modelProp.const];
  return [];
};

/**
 * Parse one docs OpenAPI file. Returns { models: Map<modelId, inputSchema>, shared, examples }
 * or null if it has no submit endpoint.
 */
function parseDoc(doc) {
  const post = doc?.paths?.['/api/generate/submit']?.post;
  const content = post?.requestBody?.content?.['application/json'];
  if (!content?.schema) return null;
  const deref = makeDeref(doc);
  const S = mergeObjectSchema(content.schema, deref);
  const models = new Map();

  const addRequestSchema = (req, forcedIds) => {
    req = mergeObjectSchema(req, deref);
    if (!isObj(req)) return;
    const input = mergeObjectSchema(req.properties?.input, deref);
    const ids = forcedIds || modelIdsOf(deref(req.properties?.model));
    if (isObj(input) && isObj(input.properties)) for (const id of ids) if (!models.has(id)) models.set(id, input);
  };

  // 1) x-poyo-model-requests: oneOf + discriminator.mapping (model -> request schema)
  // 2) top-level oneOf/anyOf of full request schemas
  for (const holder of [deref(S['x-poyo-model-requests']), S]) {
    if (!isObj(holder)) continue;
    const mapping = holder.discriminator?.mapping;
    if (isObj(mapping)) {
      for (const [id, ref] of Object.entries(mapping)) addRequestSchema({ $ref: ref }, [id]);
    }
    for (const br of [...(holder.oneOf || []), ...(holder.anyOf || [])]) addRequestSchema(br);
  }
  // 3) allOf if/then keyed on model const
  for (const br of S.allOf || []) {
    const cond = deref(br?.if?.properties?.model);
    const ids = modelIdsOf(cond);
    const thenInput = br?.then?.properties?.input;
    if (ids.length && thenInput) {
      const input = mergeObjectSchema(thenInput, deref);
      if (isObj(input?.properties)) for (const id of ids) if (!models.has(id)) models.set(id, input);
    }
  }
  // 4) shared schema
  const shared = mergeObjectSchema(S.properties?.input, deref);
  const sharedOk = isObj(shared) && isObj(shared.properties);
  for (const id of modelIdsOf(deref(S.properties?.model))) {
    if (!models.has(id) && sharedOk) models.set(id, shared);
  }

  const examples = [];
  for (const [name, ex0] of Object.entries(content.examples || {})) {
    const ex = deref(ex0);
    const value = ex?.value;
    if (!isObj(value) || !isObj(value.input)) continue;
    examples.push({ name, summary: ex.summary, model: value.model, input: value.input });
  }
  if (!examples.length && isObj(content.example?.input)) {
    examples.push({ name: 'example', model: content.example.model, input: content.example.input });
  }
  return { models, shared: sharedOk ? shared : null, examples, deref };
}

// ---------------------------------------------------------------- field schemas

const FIELD_TYPES = new Set(['string', 'integer', 'number', 'boolean', 'array', 'object']);

function pickType(t) {
  if (Array.isArray(t)) return t.find((x) => FIELD_TYPES.has(x));
  return FIELD_TYPES.has(t) ? t : undefined;
}

const MEDIA_NAME = [
  ['video', /video|clip|footage|motion_ref/],
  ['audio', /audio|voice|music|sound|speech|song|vocal|wav|mp3/],
  ['image', /image|img|frame|mask|photo|picture|face|logo|subject|style_ref|sketch|portrait|avatar|thumbnail/],
];

function detectMedia(name, field) {
  const isUriString = (f) => f && f.type === 'string' && (f.format === 'uri' || f.format === 'url');
  const nameLooksUrl = /(_url|_urls|url|urls)$/i.test(name);
  const takesUrl =
    isUriString(field) ||
    (field.type === 'array' && (isUriString(field.items) || (nameLooksUrl && field.items?.type === 'string'))) ||
    (field.type === 'string' && nameLooksUrl);
  if (!takesUrl) return undefined;
  const lname = name.toLowerCase();
  if (/callback|webhook|link|file|document|page/.test(lname)) return undefined;
  for (const [kind, re] of MEDIA_NAME) if (re.test(lname)) return kind;
  // Fall back to the description: whichever media vocabulary dominates.
  const d = (field.description || '').toLowerCase();
  const count = (re) => (d.match(re) || []).length;
  const scores = [
    ['image', count(/\bimages?\b|\bjpe?g\b|\bpng\b|\bwebp\b|\bframe/g)],
    ['video', count(/\bvideos?\b|mp4|\bmov\b/g)],
    ['audio', count(/\baudio\b|mp3|\bwav\b/g)],
  ].sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : undefined;
}

function normalizeField(raw, deref, depth = 0) {
  let f = mergeObjectSchema(raw, deref);
  if (!isObj(f)) return {};
  let type = pickType(f.type);
  let enumVals = Array.isArray(f.enum) ? f.enum : f.const !== undefined ? [f.const] : undefined;
  let format = f.format;
  let items = f.items;
  // oneOf/anyOf: union of enumerated branches (preset values); infer type from branches.
  const branches = [...(f.oneOf || []), ...(f.anyOf || [])].map((b) => mergeObjectSchema(b, deref)).filter(isObj);
  if (branches.length) {
    const vals = [];
    for (const b of branches) {
      const bv = Array.isArray(b.enum) ? b.enum : b.const !== undefined ? [b.const] : [];
      for (const v of bv) if (v !== null && !vals.includes(v)) vals.push(v);
      if (!type) {
        const bt = pickType(b.type) || (bv.length ? typeof bv[0] : undefined);
        if (bt && FIELD_TYPES.has(bt)) type = bt === 'number' && bv.every(Number.isInteger) ? 'integer' : bt;
      }
      if (!format && b.format) format = b.format;
      if (!items && b.items) items = b.items;
    }
    if (!enumVals && vals.length) enumVals = vals;
  }
  if (enumVals) enumVals = enumVals.filter((v) => ['string', 'number', 'boolean'].includes(typeof v));
  if (enumVals && f.default !== undefined && f.default !== null && !enumVals.includes(f.default)) {
    if (['string', 'number', 'boolean'].includes(typeof f.default)) enumVals = [...enumVals, f.default];
  }
  if (!type && enumVals?.length) {
    const t = typeof enumVals[0];
    type = t === 'number' ? (enumVals.every(Number.isInteger) ? 'integer' : 'number') : t;
  }
  const out = clean({
    type,
    enum: enumVals?.length ? enumVals : undefined,
    default: f.default === null ? undefined : f.default,
    minimum: typeof f.minimum === 'number' ? f.minimum : undefined,
    maximum: typeof f.maximum === 'number' ? f.maximum : undefined,
    minLength: typeof f.minLength === 'number' ? f.minLength : undefined,
    maxLength: typeof f.maxLength === 'number' ? f.maxLength : undefined,
    minItems: typeof f.minItems === 'number' ? f.minItems : undefined,
    maxItems: typeof f.maxItems === 'number' ? f.maxItems : undefined,
    format: typeof format === 'string' ? format : undefined,
    description: typeof f.description === 'string' ? truncate(f.description) : undefined,
    items: items && depth < 3 ? normalizeField(items, deref, depth + 1) : undefined,
  });
  if (isObj(out.items) && !Object.keys(out.items).length) delete out.items;
  return out;
}

function buildInputSchema(input, deref) {
  const properties = {};
  for (const [name, raw] of Object.entries(input.properties || {})) {
    if (name === 'callback_url') continue;
    const field = normalizeField(raw, deref);
    const media = detectMedia(name, field);
    if (media) field.media = media;
    properties[name] = field;
  }
  const required = (Array.isArray(input.required) ? input.required : []).filter((r) => r in properties);
  return { required, properties };
}

// ---------------------------------------------------------------- variant labels

const PHRASES = [
  ['first-last-frame-to-video', 'First & Last Frame'],
  ['first-last-frame', 'First & Last Frame'],
  ['keyframes-to-video', 'Keyframes to Video'],
  ['reference-to-video', 'Reference to Video'],
  ['text-to-video', 'Text to Video'],
  ['image-to-video', 'Image to Video'],
  ['video-to-video', 'Video to Video'],
  ['text-to-image', 'Text to Image'],
  ['image-to-image', 'Image to Image'],
  ['text-to-vector', 'Text to Vector'],
  ['image-to-vector', 'Image to Vector'],
  ['extend-video', 'Extend Video'],
  ['edit-video', 'Edit Video'],
];
const TOKEN_LABELS = { '4k': '4K', '1080p': '1080p', '720p': '720p', hd: 'HD', i2v: 'Image to Video', t2v: 'Text to Video' };

function titleToken(t) {
  const low = t.toLowerCase();
  if (TOKEN_LABELS[low]) return TOKEN_LABELS[low];
  if (low === 'to' || low === 'and') return low;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Humanize a token remainder into label units; known phrases stay atomic. */
function humanizeUnits(rest) {
  let s = rest.toLowerCase().split(/[-/_\s]+/).filter(Boolean).join('-');
  for (const [phrase, label] of PHRASES) {
    if (s.includes(phrase)) s = s.replace(phrase, `\u0000${label}\u0000`);
  }
  const units = [];
  for (const chunk of s.split('\u0000')) {
    if (!chunk || chunk === '-') continue;
    if (PHRASES.some(([, l]) => l === chunk)) units.push(chunk);
    else units.push(...chunk.split('-').filter(Boolean).map(titleToken));
  }
  return units;
}

const isVersionToken = (t) => /^v?\d+(\.\d+)*$/i.test(t);

function variantLabels(models) {
  const labels = new Map();
  if (models.length === 1) {
    labels.set(models[0], 'Standard');
    return labels;
  }
  const toks = models.map((m) => m.split(/[-/_]/));
  let pre = 0;
  while (toks.every((t) => t[pre] !== undefined && t[pre] === toks[0][pre])) pre++;
  const units = models.map((m, i) => {
    const rest = toks[i].slice(pre);
    if (!rest.length) return [];
    // "nano-banana-2" vs "nano-banana-pro": a bare version number reads badly -> use the full id
    if (isVersionToken(rest[0])) return humanizeUnits(m.replace(/(\d)\.(\d)/g, '$1~$2')).map((u) => u.replace(/~/g, '.'));
    return humanizeUnits(rest.join('-'));
  });
  // strip label units shared by every variant at the end (e.g. "... Fast", "... Official")
  while (
    units.every((u) => u.length > 1 && u[u.length - 1] === units[0][units[0].length - 1])
  )
    for (const u of units) u.pop();
  models.forEach((m, i) => labels.set(m, units[i].length ? units[i].join(' ') : 'Standard'));
  const counts = new Map();
  for (const l of labels.values()) counts.set(l, (counts.get(l) || 0) + 1);
  for (const [m, l] of labels) if (counts.get(l) > 1) labels.set(m, m);
  return labels;
}

// ---------------------------------------------------------------- pricing

function tierDims(t) {
  const d = { ...(isObj(t.dims) ? t.dims : {}) };
  if (d.resolution === undefined && typeof t.resolution === 'string') d.resolution = t.resolution;
  if (d.durations === undefined && typeof t.duration === 'number') d.durations = [t.duration];
  if (d.resolution === undefined && typeof t.spec === 'string' && /^\d+(p|k)$/i.test(t.spec.trim())) d.resolution = t.spec.trim();
  if (d.quality === undefined && typeof t.quality === 'string') d.quality = t.quality;
  if (d.audio === undefined && typeof t.hasAudio === 'boolean') d.audio = t.hasAudio;
  if (d.videoInput === undefined && typeof d.referenceVideo === 'boolean') d.videoInput = d.referenceVideo;
  if (d.videoInput === undefined && (t.mode === 'with_video' || t.mode === 'without_video'))
    d.videoInput = t.mode === 'with_video';
  return Object.keys(d).length ? d : undefined;
}

function toPriceTier(t) {
  return clean({
    credits: t.credits,
    priceUSD: t.priceUSD,
    unit: t.unit,
    spec: t.spec,
    description: typeof t.description === 'string' ? truncate(t.description) : undefined,
    dims: tierDims(t),
    appliesTo: Array.isArray(t.appliesTo) && t.appliesTo.length ? [...t.appliesTo] : undefined,
  });
}

const IMAGE_TASK = /svg|t2i|i2i|image/;
const VIDEO_TASK = /video|t2v|i2v|r2v|v2v|keyframes|first_last|extend|animate/;

/** Tier is for the other media kind (e.g. grok-imagine "video_gen" tiers on the image variant). */
function wrongKind(t, kind) {
  const tasks = t.dims?.tasks;
  if (!Array.isArray(tasks) || !tasks.length || !kind) return false;
  const kinds = tasks.map((x) => (VIDEO_TASK.test(x) ? 'video' : IMAGE_TASK.test(x) ? 'image' : null));
  return kinds.every((k) => k && k !== kind);
}

/**
 * @param kind 'image' | 'video' — from the docs series of the variant's schema
 */
function tiersForVariant(entry, model, kind) {
  const all = (entry.pricingTiers || []).filter((t) => typeof t.credits === 'number' && typeof t.priceUSD === 'number');
  const entryModels = new Set(entry.models);
  const tokens = (m) => m.toLowerCase().split(/[-/_.]/);
  const applies = (t, m) => {
    if (wrongKind(t, kind)) return false;
    if (typeof t.dims?.edition === 'string') return tokens(m).includes(t.dims.edition.toLowerCase());
    if (Array.isArray(t.appliesTo) && t.appliesTo.length) return t.appliesTo.includes(m);
    if ((t.dims?.rules || []).includes('addon_scope_all_variants')) return true;
    if (!t.model) return true;
    if (!entryModels.has(t.model)) return true; // display-name "model" -> whole entry
    return t.model === m;
  };
  const hasBase = (ts) => ts.some((t) => !t.dims?.addon);
  let tiers = all.filter((t) => applies(t, model));
  if (!hasBase(tiers)) {
    // "x-edit" variants are priced like their base model
    const base = model.replace(/[-/](edit|i2i)$/, '');
    if (base !== model && entryModels.has(base)) {
      const alt = all.filter((t) => applies(t, base));
      if (hasBase(alt)) {
        tiers = alt;
        notes.push({ id: entry.id, reason: `${model}: priced with base model ${base}` });
      }
    }
  }
  if (!hasBase(tiers)) {
    // Every tier names the same single model and no appliesTo: entry-level pricing in practice.
    const named = new Set(all.map((t) => t.model).filter(Boolean));
    if (named.size === 1 && !all.some((t) => t.appliesTo?.length)) {
      const only = [...named][0];
      const alt = all.filter((t) => !wrongKind(t, kind) && (typeof t.dims?.edition !== 'string' || tokens(model).includes(t.dims.edition.toLowerCase())));
      if (hasBase(alt)) {
        tiers = alt;
        notes.push({ id: entry.id, reason: `${model}: no tiers of its own; using entry tiers labelled ${only}` });
      }
    }
  }
  return tiers.map(toPriceTier);
}

// ---------------------------------------------------------------- main

function main() {
  const modelsJson = JSON.parse(git(POYOAPI_REPO, ['show', `${REF}:data/models.json`]));
  if (!Array.isArray(modelsJson)) throw new Error('models.json is not an array');

  // Load every image/video doc so variants whose doc link is wrong can be found by model enum.
  const tree = git(DOCS_REPO, ['ls-tree', '-r', '--name-only', REF, 'api-manual'])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const treeSet = new Set(tree);
  const wanted = new Set(tree.filter((p) => DOC_SERIES.some((s) => p.startsWith(`api-manual/${s}/`)) && p.endsWith('.json')));
  for (const e of modelsJson) {
    for (const url of [e.doc, ...Object.values(e.docByModel || {})]) {
      const p = docUrlToPath(url);
      if (p && treeSet.has(p)) wanted.add(p);
    }
  }
  const paths = [...wanted].sort();
  const blobs = readBlobs(DOCS_REPO, paths.map((p) => `${REF}:${p}`));
  const docs = new Map(); // path -> parsed
  const modelIndex = new Map(); // modelId -> path (first by sorted path)
  for (const p of paths) {
    const text = blobs.get(`${REF}:${p}`);
    if (text == null) continue;
    let parsed = null;
    try {
      parsed = parseDoc(JSON.parse(text));
    } catch (err) {
      warnings.push({ id: p, reason: `invalid docs JSON: ${err.message}` });
    }
    if (!parsed) continue;
    docs.set(p, parsed);
    for (const id of parsed.models.keys()) if (!modelIndex.has(id)) modelIndex.set(id, p);
  }

  const out = [];
  modelsJson.forEach((entry, order) => {
    const category = CATEGORY_MAP[entry.category];
    if (!category) return;
    if (entry.comingSoon) {
      warnings.push({ id: entry.id, reason: 'comingSoon' });
      return;
    }
    const modelIds = Array.isArray(entry.models) ? entry.models : [];
    if (!modelIds.length) {
      warnings.push({ id: entry.id, reason: 'no models listed' });
      return;
    }
    const labels = variantLabels(modelIds);
    const variants = [];
    const missing = [];
    for (const model of modelIds) {
      const url = entry.docByModel?.[model] || entry.doc;
      const preferred = docUrlToPath(url);
      let docPath = null;
      let input = null;
      const pd = preferred && docs.get(preferred);
      if (pd?.models.has(model)) {
        docPath = preferred;
        input = pd.models.get(model);
      } else if (modelIndex.has(model)) {
        docPath = modelIndex.get(model);
        input = docs.get(docPath).models.get(model);
        notes.push({ id: entry.id, reason: `${model}: doc ${preferred ?? url} lacks it; using ${docPath}` });
      } else if (pd?.shared) {
        docPath = preferred;
        input = pd.shared;
        notes.push({ id: entry.id, reason: `${model}: not in ${preferred} model enum; using its shared schema` });
      }
      if (!input) {
        missing.push(`${model} (${preferred ? (treeSet.has(preferred) ? 'no submit schema in ' : 'missing doc ') + preferred : 'no doc URL'})`);
        continue;
      }
      const parsed = docs.get(docPath);
      const schema = buildInputSchema(input, parsed.deref);
      const examples = parsed.examples
        .filter((ex) => !ex.model || ex.model === model)
        .slice(0, MAX_EXAMPLES)
        .map((ex) => {
          const { callback_url: _cb, ...inp } = ex.input;
          void _cb;
          return clean({ name: ex.name, summary: ex.summary, input: inp });
        });
      const docUrl = DOCS_ORIGIN + docPath.replace(/\.json$/, '');
      variants.push(
        clean({
          model,
          label: labels.get(model),
          schema,
          examples,
          pricing: tiersForVariant(entry, model, docPath.includes('/video-series/') ? 'video' : docPath.includes('/image-series/') ? 'image' : undefined),
          docUrl,
        }),
      );
    }
    if (missing.length) {
      warnings.push({
        id: entry.id,
        reason: `${variants.length ? 'variant(s) dropped' : 'skipped, no resolvable schema'}: ${missing.join('; ')}`,
      });
    }
    if (!variants.length) return;
    const defaultVariant = variants.some((v) => v.model === entry.defaultModel) ? entry.defaultModel : variants[0].model;
    out.push(
      clean({
        id: entry.id,
        name: entry.name,
        provider: entry.provider,
        icon: entry.icon || undefined,
        thumbnail: entry.thumbnail || undefined,
        category,
        tasks: Array.isArray(entry.tasks) ? entry.tasks : [],
        description: truncate(entry.description || ''),
        isNew: entry.isNew === true ? true : undefined,
        featured: entry.featured === true ? true : undefined,
        order,
        defaultVariant,
        variants,
        pageUrl: `https://poyo.ai/models/${entry.id}`,
      }),
    );
  });

  // Deterministic timestamp: newest source commit date.
  const dates = [POYOAPI_REPO, DOCS_REPO].map((r) => git(r, ['log', '-1', '--format=%cI', REF]).trim());
  const generatedAt = new Date(Math.max(...dates.map((d) => Date.parse(d)))).toISOString();

  const catalog = { generatedAt, apiBase: API_BASE, models: out };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2) + '\n');

  const counts = out.reduce((a, m) => ((a[m.category] = (a[m.category] || 0) + 1), a), {});
  const nVariants = out.reduce((a, m) => a + m.variants.length, 0);
  console.log(`Wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
  console.log(`Models: ${out.length} (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}), variants: ${nVariants}`);
  if (notes.length) {
    console.log(`\nNotes (${notes.length}):`);
    for (const n of notes) console.log(`  - ${n.id}: ${n.reason}`);
  }
  if (warnings.length) {
    console.warn(`\nSkipped / warnings (${warnings.length}):`);
    for (const w of warnings) console.warn(`  - ${w.id}: ${w.reason}`);
  }
}

main();
