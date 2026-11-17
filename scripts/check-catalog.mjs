#!/usr/bin/env node
/**
 * Validates src/data/catalog.json against the shape in src/types/catalog.ts.
 * Usage: node scripts/check-catalog.mjs   (exit code 1 on errors)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.resolve(ROOT, process.argv[2] || 'src/data/catalog.json');
const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));

const errors = [];
const warn = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

const FIELD_TYPES = new Set(['string', 'integer', 'number', 'boolean', 'array', 'object']);
const FIELD_KEYS = new Set(['type', 'enum', 'default', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'format', 'description', 'items', 'media']);

function checkField(where, f) {
  if (!f || typeof f !== 'object') return err(where, 'field is not an object');
  for (const k of Object.keys(f)) if (!FIELD_KEYS.has(k)) err(where, `unexpected field key "${k}"`);
  if (f.type !== undefined && !FIELD_TYPES.has(f.type)) err(where, `bad type ${f.type}`);
  if (f.media !== undefined && !['image', 'video', 'audio'].includes(f.media)) err(where, `bad media ${f.media}`);
  if (f.enum !== undefined && (!Array.isArray(f.enum) || !f.enum.length)) err(where, 'enum must be a non-empty array');
  if (f.items) checkField(`${where}.items`, f.items);
}

if (typeof catalog.generatedAt !== 'string' || Number.isNaN(Date.parse(catalog.generatedAt))) err('catalog', 'generatedAt');
if (catalog.apiBase !== 'https://api.poyo.ai') err('catalog', `apiBase ${catalog.apiBase}`);
if (!Array.isArray(catalog.models) || !catalog.models.length) err('catalog', 'models empty');

const ids = new Set();
const counts = {};
let variants = 0;
let usageBilled = 0;
let lastOrder = -1;
for (const m of catalog.models || []) {
  const w = `model ${m.id}`;
  if (ids.has(m.id)) err(w, 'duplicate id');
  ids.add(m.id);
  for (const k of ['id', 'name', 'provider', 'description', 'defaultVariant', 'pageUrl']) if (typeof m[k] !== 'string') err(w, `${k} missing`);
  if (!['image', 'video'].includes(m.category)) err(w, `category ${m.category}`);
  if (!Array.isArray(m.tasks)) err(w, 'tasks');
  if (!Number.isInteger(m.order) || m.order <= lastOrder) err(w, `order ${m.order} not increasing`);
  lastOrder = m.order;
  if (m.pageUrl !== `https://poyo.ai/models/${m.id}`) err(w, 'pageUrl');
  if (m.description.length > 601) err(w, 'description not truncated');
  counts[m.category] = (counts[m.category] || 0) + 1;
  if (!Array.isArray(m.variants) || !m.variants.length) {
    err(w, 'no variants');
    continue;
  }
  if (!m.variants.some((v) => v.model === m.defaultVariant)) err(w, `defaultVariant ${m.defaultVariant} not among variants`);
  const models = new Set();
  for (const v of m.variants) {
    const vw = `${w} / ${v.model}`;
    variants++;
    if (models.has(v.model)) err(vw, 'duplicate variant');
    models.add(v.model);
    if (typeof v.label !== 'string' || !v.label) err(vw, 'label');
    const props = v.schema?.properties;
    if (!props || typeof props !== 'object' || !Array.isArray(v.schema.required)) {
      err(vw, 'schema missing');
      continue;
    }
    if ('callback_url' in props) err(vw, 'callback_url not stripped');
    for (const r of v.schema.required) if (!(r in props)) err(vw, `required "${r}" not in properties`);
    for (const [k, f] of Object.entries(props)) checkField(`${vw}.${k}`, f);
    const hasMedia = Object.values(props).some((f) => f.media);
    if (!props.prompt && !hasMedia) err(vw, 'neither prompt nor a media field');
    if (!Array.isArray(v.examples)) err(vw, 'examples');
    for (const ex of v.examples || []) {
      if (typeof ex.name !== 'string' || !ex.input || typeof ex.input !== 'object') err(vw, `bad example ${ex.name}`);
      if (ex.input && 'callback_url' in ex.input) err(vw, `example ${ex.name} has callback_url`);
    }
    if (!Array.isArray(v.pricing)) err(vw, 'pricing');
    else if (!v.pricing.length) warn.push(`${vw}: no pricing tiers`);
    for (const t of v.pricing || []) {
      if (typeof t.credits !== 'number' || typeof t.priceUSD !== 'number' || typeof t.unit !== 'string') err(vw, `bad tier ${JSON.stringify(t)}`);
    }
    if ((v.pricing || []).length && v.pricing.every((t) => /token/i.test(t.unit) || t.dims?.unit === 'mtok')) usageBilled++;
  }
}

console.log(`Catalog: ${file}`);
console.log(`Generated: ${catalog.generatedAt}`);
console.log(`Models: ${catalog.models?.length} (${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ')}), variants: ${variants}, token-billed variants: ${usageBilled}`);
for (const w of warn) console.warn(`warn  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error ${e}`);
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log('OK');
