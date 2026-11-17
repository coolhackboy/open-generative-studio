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
    models = [...c.models]
      .filter((m) => m.variants.length > 0)
      .sort((a, b) => a.order - b.order);
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
