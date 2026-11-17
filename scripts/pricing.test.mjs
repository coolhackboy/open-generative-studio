// Run: node --test scripts/pricing.test.mjs
// Imports the TypeScript source directly (Node >= 22.18 / 23.6 strips types natively).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { estimateCost, formatUSD, startingPrice } from '../src/lib/pricing.ts';

const catalog = JSON.parse(fs.readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
const variant = (id, model) => {
  const m = catalog.models.find((x) => x.id === id);
  assert.ok(m, `model ${id} in catalog`);
  const v = model ? m.variants.find((x) => x.model === model) : m.variants[0];
  assert.ok(v, `variant ${model} of ${id}`);
  return v;
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('formatUSD', () => {
  assert.equal(formatUSD(0), '$0');
  assert.equal(formatUSD(1.5), '$1.50');
  assert.equal(formatUSD(0.205), '$0.205');
  assert.equal(formatUSD(0.0085), '$0.0085');
  assert.equal(formatUSD(0.02), '$0.02');
});

test('per second: resolution + video-input presence select the tier', () => {
  const v = variant('seedance-2-5-flash');
  const e = estimateCost(v, { prompt: 'x', duration: 5, resolution: '720p' });
  close(e.usd, 0.205 * 5);
  close(e.credits, 41 * 5);
  const e480 = estimateCost(v, { prompt: 'x', duration: 10, resolution: '480p' });
  close(e480.usd, 0.0925 * 10);
  // with a reference video -> billed seconds tier (output + reference)
  const ev = estimateCost(v, { prompt: 'x', duration: 5, resolution: '720p', reference_video_urls: ['https://e/x.mp4'] }, { referenceVideoSeconds: 8 });
  close(ev.usd, 0.1275 * 13);
});

test('per second needs a duration', () => {
  const v = variant('seedance-2-5-flash');
  const noDur = { ...v, schema: { ...v.schema, properties: { ...v.schema.properties, duration: { type: 'integer' } } } };
  assert.equal(estimateCost(noDur, { prompt: 'x' }), null);
});

test('per image: multiplies by n and adds reference-image surcharge', () => {
  const v = variant('seedream-5-5', 'seedream-5.5');
  const e = estimateCost(v, { prompt: 'x', resolution: '2K', image_urls: ['a', 'b'] });
  close(e.usd, 0.035 + 2 * 0.008);
  const fixed = variant('gpt-image-2-6', 'gpt-image-2.6-fixed');
  // Fixed exposes no resolution input -> cheapest tier, flagged as "from"; reference images are free
  const f = estimateCost(fixed, { prompt: 'x', image_urls: ['a'] });
  close(f.usd, 0.0085);
  assert.match(f.label, /^from /);
  const flux = variant('flux-3-klein', 'flux-3-klein-edit');
  const fe = estimateCost(flux, { prompt: 'x', image_urls: ['a'], n: 3 });
  assert.ok(fe && fe.usd > 0 && /× 3/.test(fe.label), fe?.label);
});

test('flat per video picks duration tier', () => {
  const v = variant('wan-2-6', 'wan2.6-text-to-video');
  const e = estimateCost(v, { prompt: 'x', resolution: '1080p', duration: 10 });
  close(e.usd, 1.2);
});

test('token-billed variants return null', () => {
  assert.equal(estimateCost(variant('gpt-image-2-6', 'gpt-image-2.6-flare'), { prompt: 'x' }), null);
  assert.equal(startingPrice(variant('gpt-image-2-6', 'gpt-image-2.6-flare')), null);
});

test('every catalog variant either estimates or returns null without throwing', () => {
  let estimated = 0;
  for (const m of catalog.models) {
    for (const v of m.variants) {
      const ex = v.examples[0]?.input ?? { prompt: 'x' };
      const e = estimateCost(v, ex);
      if (e) {
        assert.ok(Number.isFinite(e.usd) && e.usd >= 0, `${v.model} usd`);
        close(Math.round(e.credits * 0.005 * 1e4) / 1e4, Math.round(e.usd * 1e4) / 1e4);
        estimated++;
      }
    }
  }
  assert.ok(estimated > 100, `estimated ${estimated}`);
});
