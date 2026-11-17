import { Check, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { config } from '../config';
import { snippet, type SnippetLang } from '../lib/code-snippets';
import { local } from '../lib/db';
import { copyText } from '../lib/clipboard';
import { Segmented, Tooltip } from '../ui';

const LANGS: { value: SnippetLang; label: string }[] = [
  { value: 'curl', label: 'cURL' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
];

const KEY = 'ogs.codeLang';

/** "Copy as code": submit + poll snippets for a model/input, key read from an env var. */
export function CodeTabs({ baseUrl, model, input }: { baseUrl: string; model: string; input: Record<string, unknown> }) {
  const [lang, setLang] = useState<SnippetLang>(() => {
    const saved = local.get(KEY);
    return saved === 'javascript' || saved === 'python' ? saved : 'curl';
  });
  const [copied, setCopied] = useState(false);
  const code = useMemo(
    () => snippet(lang, { baseUrl, model, input, keyEnvVar: config.provider.keyEnvVar }),
    [lang, baseUrl, model, input],
  );

  return (
    <div className="overflow-hidden rounded-md border border-line bg-bg-subtle">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1.5">
        <Segmented<SnippetLang>
          label="Language"
          size="sm"
          value={lang}
          options={LANGS}
          onChange={(l) => {
            setLang(l);
            local.set(KEY, l);
          }}
          className="border-0 bg-transparent"
        />
        <Tooltip label={copied ? 'Copied' : 'Copy code'}>
          <button
            type="button"
            aria-label="Copy code"
            onClick={async () => {
              await copyText(code, 'Code copied');
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex size-7 items-center justify-center rounded-xs text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {copied ? <Check size={14} className="text-accent-ink" /> : <Copy size={14} />}
          </button>
        </Tooltip>
      </div>
      <pre
        tabIndex={0}
        aria-label={`${lang} code`}
        className="thin-scrollbar max-h-72 overflow-auto p-3 font-mono text-[11.5px] leading-[1.6] text-fg-muted"
      >
        <code>{code}</code>
      </pre>
      <p className="border-t border-line px-3 py-2 text-xs text-fg-subtle">
        Reads your key from <code className="font-mono text-fg-muted">${config.provider.keyEnvVar}</code> — it is never
        embedded in the snippet.
      </p>
    </div>
  );
}
