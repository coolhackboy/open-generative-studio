import { ArrowUpRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { config } from '../config';
import { isFixtureCatalog } from '../data/catalog';
import { MOCK_MODE } from '../lib/api';
import { useGallery, useSettings, useUI } from '../lib/store';
import { Button, Dialog, Field, Input, Segmented, toast, useTheme, type ThemePref } from '../ui';

export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen);
  const setOpen = useUI((s) => s.setSettingsOpen);
  const { apiKey, apiBase, setApiKey, setApiBase } = useSettings();
  const theme = useTheme((s) => s.pref);
  const setTheme = useTheme((s) => s.setPref);
  const count = useGallery((s) => s.items.length);
  const clearAll = useGallery((s) => s.clearAll);

  const [key, setKey] = useState(apiKey);
  const [base, setBase] = useState(apiBase);
  const [reveal, setReveal] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKey(apiKey);
    setBase(apiBase);
    setReveal(false);
    setConfirmClear(false);
  }, [open, apiKey, apiBase]);

  const dirty = key.trim() !== apiKey || (base.trim().replace(/\/+$/, '') || config.defaultApiBase) !== apiBase;
  const baseValid = /^https?:\/\/[^\s]+$/.test(base.trim() || config.defaultApiBase);

  const save = () => {
    if (!baseValid) return;
    setApiKey(key);
    setApiBase(base);
    toast.success(key.trim() ? 'Settings saved' : 'API key removed');
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Settings"
      description={`Everything here is stored only in this browser.`}
      size="md"
    >
      <form
        className="flex min-h-0 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="thin-scrollbar flex flex-col gap-5 overflow-y-auto px-5 pt-2 pb-5">
          <Field
            label={`${config.provider.name} API key`}
            action={
              <a
                href={config.provider.apiKeyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-accent-ink hover:underline"
              >
                Get a key <ArrowUpRight size={12} />
              </a>
            }
            hint={
              <span className="inline-flex items-start gap-1.5">
                <ShieldCheck size={13} className="mt-[3px] shrink-0 text-fg-subtle" />
                <span>
                  Saved in localStorage and sent only to the API base URL below. Generations are billed to this key’s
                  account.
                  {MOCK_MODE && ' Mock mode is on — the key is not used.'}
                </span>
              </span>
            }
          >
            {(id, hintId) => (
              <div className="relative">
                <Input
                  id={id}
                  aria-describedby={hintId}
                  data-autofocus
                  type={reveal ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-…"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? 'Hide key' : 'Show key'}
                  aria-pressed={reveal}
                  className="absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-xs text-fg-subtle hover:text-fg"
                >
                  {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            )}
          </Field>

          <Field
            label="API base URL"
            hint={
              base.trim() && !baseValid
                ? 'Enter a full URL starting with https://'
                : `Use your own gateway or reseller endpoint. Default: ${config.defaultApiBase}`
            }
            action={
              base.trim() !== config.defaultApiBase ? (
                <button
                  type="button"
                  onClick={() => setBase(config.defaultApiBase)}
                  className="text-xs text-fg-muted hover:text-fg"
                >
                  Reset
                </button>
              ) : null
            }
          >
            {(id, hintId) => (
              <Input
                id={id}
                aria-describedby={hintId}
                aria-invalid={!baseValid || undefined}
                type="url"
                inputMode="url"
                spellCheck={false}
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="font-mono"
              />
            )}
          </Field>

          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] font-medium text-fg">Theme</span>
            <Segmented<ThemePref>
              label="Theme"
              size="sm"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-line px-3.5 py-3">
            <div>
              <div className="text-[13px] font-medium text-fg">Local gallery</div>
              <div className="mt-0.5 text-xs text-fg-subtle">
                {count} generation{count === 1 ? '' : 's'} in IndexedDB. Output URLs are hosted by the provider and may
                expire.
              </div>
            </div>
            <Button
              variant={confirmClear ? 'danger' : 'ghost'}
              size="sm"
              disabled={count === 0}
              onClick={async () => {
                if (!confirmClear) return setConfirmClear(true);
                await clearAll();
                setConfirmClear(false);
                toast.success('Gallery cleared');
              }}
            >
              {confirmClear ? 'Confirm' : 'Clear'}
            </Button>
          </div>

          {import.meta.env.DEV && (
            <p className="text-xs text-fg-subtle">
              Dev: {isFixtureCatalog ? 'fixture catalog' : 'generated catalog'} · add{' '}
              <code className="font-mono">?mock=1</code> to simulate the API.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-bg-subtle/50 px-5 py-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!dirty || !baseValid}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
