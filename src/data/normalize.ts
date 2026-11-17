import type { CatalogModel, Variant } from '../types/catalog';

/*
 * Pure catalog normalization (type-only imports, so Node scripts can import it too:
 * scripts/readme-models.mjs uses it to keep the README count/table identical to the app).
 */

/** How many of the newest models keep their "New" badge. */
const NEW_BADGE_COUNT = 6;

/** An image-output variant filed under a video model (e.g. grok-imagine-image) — not "image-to-video". */
const isImageVariant = (v: Variant) =>
  !('duration' in v.schema.properties) && (/^image$/i.test(v.label) || /[-_/.]image$/i.test(v.model));

function dedupeEnums(v: Variant): Variant {
  let changed = false;
  const properties = Object.fromEntries(
    Object.entries(v.schema.properties).map(([k, f]) => {
      if (!f.enum) return [k, f];
      const seen = new Set<string>();
      const unique = f.enum.filter((e) => {
        const key = String(e).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (unique.length === f.enum.length) return [k, f];
      changed = true;
      return [k, { ...f, enum: unique }];
    }),
  );
  return changed ? { ...v, schema: { ...v.schema, properties } } : v;
}

/** Image edit variants need a source image even when the schema forgets to say so. */
function requireEditImage(v: Variant, category: CatalogModel['category']): Variant {
  if (category !== 'image' || !/edit/i.test(`${v.model} ${v.label}`)) return v;
  const props = v.schema.properties;
  const field = 'image_urls' in props ? 'image_urls' : Object.keys(props).find((k) => props[k].media === 'image' && !/mask/.test(k));
  if (!field || v.schema.required.includes(field)) return v;
  return { ...v, schema: { ...v.schema, required: [...v.schema.required, field] } };
}

/**
 * UI-side fixes for catalog quirks: case-duplicate enum values, image variants filed under
 * video models (split into their own image entry), edit variants without a required image,
 * and a "New" badge limited to the most recent models.
 */
export function normalize(input: CatalogModel[]): CatalogModel[] {
  const out: CatalogModel[] = [];
  for (const m of input) {
    if (m.variants.length === 0) continue;
    const variants = m.variants.map(dedupeEnums);
    const misfiled = m.category === 'video' ? variants.filter(isImageVariant) : [];
    const own = variants.filter((v) => !misfiled.includes(v));
    if (misfiled.length && own.length) {
      out.push({ ...m, variants: own, defaultVariant: own.some((v) => v.model === m.defaultVariant) ? m.defaultVariant : own[0].model });
      out.push({
        ...m,
        id: `${m.id}-image`,
        name: `${m.name} Image`,
        category: 'image',
        tasks: m.tasks.map((t) => t.replace(/video/i, 'Image')).filter((t, i, a) => a.indexOf(t) === i),
        variants: misfiled,
        defaultVariant: misfiled[0].model,
        isNew: false,
        featured: false,
        order: m.order + 0.5,
      });
    } else out.push({ ...m, variants });
  }
  const sorted = out
    .map((m) => ({ ...m, variants: m.variants.map((v) => requireEditImage(v, m.category)) }))
    .sort((a, b) => a.order - b.order);
  const newest = new Set(sorted.filter((m) => m.isNew).slice(0, NEW_BADGE_COUNT).map((m) => m.id));
  return sorted.map((m) => (m.isNew && !newest.has(m.id) ? { ...m, isNew: false } : m));
}
