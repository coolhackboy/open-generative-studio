import { ImageOff } from 'lucide-react';
import { useMemo } from 'react';
import { MOCK_MODE } from '../lib/api';
import { estimateAspect } from '../lib/schema';
import { useGallery, useSettings, type GalleryFilter } from '../lib/store';
import type { Generation } from '../lib/types';
import { Masonry, Segmented } from '../ui';
import { GenerationCard } from './GenerationCard';
import { Onboarding } from './Onboarding';
import { StartHere } from './StartHere';

const getKey = (g: Generation) => g.id;
const getAspect = (g: Generation) =>
  // Failed cards hold only text: keep them compact regardless of the requested ratio.
  g.status === 'failed' ? Math.max(3 / 2, g.aspect ?? 0) : (g.aspect ?? estimateAspect(g.category, g.input));
const renderCard = (g: Generation) => <GenerationCard gen={g} />;

export function Gallery() {
  const items = useGallery((s) => s.items);
  const loaded = useGallery((s) => s.loaded);
  const filter = useGallery((s) => s.filter);
  const setFilter = useGallery((s) => s.setFilter);
  const hasKey = useSettings((s) => Boolean(s.apiKey));

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((g) => g.category === filter)),
    [items, filter],
  );
  const counts = useMemo(
    () => ({
      all: items.length,
      image: items.filter((g) => g.category === 'image').length,
      video: items.filter((g) => g.category === 'video').length,
    }),
    [items],
  );

  const showOnboarding = !hasKey || MOCK_MODE;

  if (!loaded) return <div className="min-h-[60dvh]" aria-busy="true" />;

  if (items.length === 0) {
    return (
      <div className="pt-2">
        {showOnboarding ? (
          <Onboarding />
        ) : (
          <div className="pt-6 pb-2">
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-fg sm:text-[28px]">What will you make?</h1>
            <p className="mt-2 text-sm text-fg-muted">Your generations will appear here, newest first. Saved locally in this browser.</p>
          </div>
        )}
        <StartHere />
      </div>
    );
  }

  const label = (text: string, n: number) => (
    <>
      {text}
      <span className="font-mono text-xs text-fg-subtle tabular-nums">{n}</span>
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      {!hasKey && !MOCK_MODE && <Onboarding compact />}
      <div className="flex items-center justify-between gap-3">
        <h1 className="sr-only">Your gallery</h1>
        <Segmented<GalleryFilter>
          label="Filter gallery"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: label('All', counts.all), title: 'All' },
            { value: 'image', label: label('Images', counts.image), title: 'Images' },
            { value: 'video', label: label('Videos', counts.video), title: 'Videos' },
          ]}
        />
        <span className="hidden text-xs text-fg-subtle sm:block">Stored locally in this browser</span>
      </div>
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-center text-fg-subtle">
          <ImageOff size={22} />
          <p className="text-sm">No {filter === 'image' ? 'images' : 'videos'} yet.</p>
        </div>
      ) : (
        <Masonry items={visible} getKey={getKey} getAspect={getAspect} render={renderCard} gap={10} />
      )}
    </div>
  );
}
