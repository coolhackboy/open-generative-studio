import { motion } from 'motion/react';
import { ArrowUpRight, FlaskConical, KeyRound, Sparkles } from 'lucide-react';
import { config } from '../config';
import { MOCK_MODE } from '../lib/api';
import { modKey } from '../lib/format';
import { useUI } from '../lib/store';
import { seedDemo } from '../lib/tasks';
import { Button, Kbd } from '../ui';

const steps = [
  { title: `Create a key on ${config.provider.name}`, body: 'Takes a minute. Pay only for what you generate.' },
  { title: 'Paste it in Settings', body: 'Stored only in this browser — never sent anywhere else.' },
  { title: 'Describe, then generate', body: null },
];

/** First-run card explaining bring-your-own-key. */
export function Onboarding({ compact }: { compact?: boolean }) {
  const openSettings = useUI((s) => s.setSettingsOpen);

  if (MOCK_MODE) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 rounded-lg border border-warning/25 bg-warning/[0.04] p-5 sm:flex-row sm:items-center"
      >
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning">
          <FlaskConical size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-fg">Mock mode is on</h2>
          <p className="mt-1 text-[13px] leading-5 text-fg-muted">
            Submit, status and upload are simulated with sample media — nothing is billed. Prompts containing
            “fail” produce a failed task. Remove <code className="font-mono text-xs">?mock=1</code> (or use{' '}
            <code className="font-mono text-xs">?mock=0</code>) to use the real API.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void seedDemo()} icon={<Sparkles size={15} />}>
          Load demo gallery
        </Button>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby="onboarding-title"
      className="relative overflow-hidden rounded-lg border border-line bg-surface"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-accent opacity-[0.07] blur-3xl"
      />
      <div className={compact ? 'grid gap-6 p-5 md:grid-cols-[1fr_auto] md:items-center' : 'grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr]'}>
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-2xs font-medium tracking-wide text-fg-muted uppercase">
            <KeyRound size={12} className="text-accent" />
            Bring your own key
          </span>
          <h2 id="onboarding-title" className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-fg sm:text-[28px] sm:leading-9">
            Your studio. Your {config.provider.name} account.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-fg-muted">
            {config.brandName} talks to the {config.provider.name} API straight from your browser. Every generation is
            billed to your own account — no middleman, no markup, and your works stay on this device.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" size="lg" onClick={() => openSettings(true)} icon={<KeyRound size={16} />}>
              Add API key
            </Button>
            <a
              href={config.provider.onboardingKeyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-1.5 rounded-md border border-line-strong px-5 text-[15px] font-medium text-fg transition-colors hover:bg-surface-2"
            >
              Get a key
              <ArrowUpRight size={16} className="text-fg-muted" />
            </a>
          </div>
        </div>
        {!compact && (
          <ol className="flex flex-col gap-px self-center overflow-hidden rounded-md border border-line bg-line">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4 bg-surface px-4 py-3.5">
                <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-xs text-fg-muted">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-medium text-fg">{s.title}</div>
                  <div className="mt-0.5 text-xs leading-5 text-fg-subtle">
                    {s.body ?? (
                      <span className="inline-flex items-center gap-1">
                        Press <Kbd>{modKey}</Kbd>
                        <Kbd>↵</Kbd> anywhere to generate.
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </motion.section>
  );
}
