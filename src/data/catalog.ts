import type { Catalog, CatalogModel, Variant } from '../types/catalog';

/**
 * Loads the generated catalog (`catalog.json`, built by `scripts/build-catalog.mjs`) when
 * present, otherwise the small checked-in fixture. The catalog is code-split (~700 KB) and
 * loaded once at startup via `loadCatalog()`; the accessors below are valid afterwards.
 *
 * `import.meta.glob` keeps the build green whether or not the generated file exists.
 * Dev tip: `?fixture=1` forces the fixture.
 */
const loaders = import.meta.glob<Catalog>(['./catalog.json', './catalog.fixture.json'], {
  import: 'default',
});

export let catalog: Catalog = { generatedAt: '', apiBase: '', models: [] };
export let isFixtureCatalog = true;
/** Models sorted by catalog order (newest first). */
export let models: CatalogModel[] = [];
export let defaultModel: CatalogModel | undefined;

let byId = new Map<string, CatalogModel>();
let byVariant = new Map<string, { model: CatalogModel; variant: Variant }>();
let loading: Promise<Catalog> | null = null;

function wantsFixture(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return new URLSearchParams(window.location.search).get('fixture') === '1';
  } catch {
    return false;
  }
}

export function loadCatalog(): Promise<Catalog> {
  if (loading) return loading;
  const real = wantsFixture() ? undefined : loaders['./catalog.json'];
  const load = real ?? loaders['./catalog.fixture.json'];
  loading = load().then((c) => {
    catalog = c;
    isFixtureCatalog = !real;
    models = normalize(c.models);
    byId = new Map(models.map((m) => [m.id, m]));
    byVariant = new Map();
    for (const m of models) for (const v of m.variants) byVariant.set(v.model, { model: m, variant: v });
    defaultModel =
      models.find((m) => m.id === 'seedance-2-5-flash') ??
      models.find((m) => m.featured && m.category === 'video') ??
      models[0];
    return c;
  });
  return loading;
}

// ---------------------------------------------------------------- normalization

/** How many of the newest models keep their "New" badge. */
const NEW_BADGE_COUNT = 6;

const isImageVariant = (v: Variant) => /(^|[-_/.])image([-_/.]|$)/i.test(v.model) || /^image$/i.test(v.label);

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
function normalize(input: CatalogModel[]): CatalogModel[] {
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

export function getModel(id: string): CatalogModel | undefined {
  return byId.get(id);
}

export function findVariant(apiModel: string): { model: CatalogModel; variant: Variant } | undefined {
  return byVariant.get(apiModel);
}

export function getVariant(model: CatalogModel, apiModel?: string): Variant {
  return (
    model.variants.find((v) => v.model === apiModel) ??
    model.variants.find((v) => v.model === model.defaultVariant) ??
    model.variants[0]
  );
}
