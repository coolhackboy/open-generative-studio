import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Code2, Copy } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { config } from '../config';
import { copyText } from '../lib/clipboard';
import { snippet, type SnippetLang } from '../lib/code-snippets';
import { local } from '../lib/db';
import { cn, Segmented } from '../ui';

const LANGS: { value: SnippetLang; label: string }[] = [
  { value: 'curl', label: 'cURL' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
];

const KEY = 'ogs.codeLang';

const KEYWORDS: Record<SnippetLang, RegExp> = {
  curl: /^(curl|jq|echo|while|do|done|if|then|fi|break|sleep|true|export)$/,
  javascript: /^(const|let|await|async|new|do|while|if|throw|return|true|false|null|of|for)$/,
  python: /^(import|from|def|while|if|in|break|raise|print|True|False|None|for|return|and|or|not)$/,
};

/** Tiny tokenizer (strings, comments, numbers, keywords, JSON keys) — enough to make snippets scannable. */
function highlight(code: string, lang: SnippetLang): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(#[^\n]*|\/\/[^\n]*)|("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [text, comment, key, str, num, word] = m;
    // In shell, "#" only starts a comment at line start or after whitespace.
    const isComment = comment && (lang !== 'curl' || m.index === 0 || /\s/.test(code[m.index - 1]));
    if (isComment) out.push(<span key={k++} className="code-token-comment">{text}</span>);
    else if (comment) out.push(text);
    else if (key) out.push(<span key={k++} className="code-token-key">{text}</span>);
    else if (str) out.push(<span key={k++} className="code-token-string">{text}</span>);
    else if (num) out.push(<span key={k++} className="code-token-number">{text}</span>);
    else if (word && KEYWORDS[lang].test(word)) out.push(<span key={k++} className="code-token-keyword">{text}</span>);
    else out.push(text);
    last = m.index + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

/** "Copy as code": submit + poll snippets for a model/input, key read from an env var. */
export function CodeTabs({
  baseUrl,
  model,
  input,
  defaultOpen = false,
}: {
  baseUrl: string;
  model: string;
  input: Record<string, unknown>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [lang, setLang] = useState<SnippetLang>(() => {
    const saved = local.get(KEY);
    return saved === 'javascript' || saved === 'python' ? saved : 'curl';
  });
  const [copied, setCopied] = useState(false);
  const code = useMemo(
    () => snippet(lang, { baseUrl, model, input, keyEnvVar: config.provider.keyEnvVar }),
    [lang, baseUrl, model, input],
  );
  const tokens = useMemo(() => (open ? highlight(code, lang) : null), [code, lang, open]);

  const copy = async () => {
    await copyText(code, 'Code copied');
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="overflow-hidden rounded-md border border-line bg-bg-subtle">
      {!defaultOpen && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-fg transition-colors hover:bg-surface-2"
        >
          <Code2 size={15} className="text-fg-subtle" />
          <span className="flex-1">Copy as code</span>
          <span className="text-xs text-fg-subtle">cURL · JavaScript · Python</span>
          <ChevronDown size={15} className={cn('text-fg-subtle transition-transform', open && 'rotate-180')} />
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(!defaultOpen && 'border-t border-line')}
          >
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
              <button
                type="button"
                onClick={() => void copy()}
                aria-live="polite"
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-xs px-2 text-xs font-medium transition-colors',
                  copied ? 'text-accent-ink' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre
              tabIndex={0}
              aria-label={`${lang} code`}
              className="thin-scrollbar max-h-72 overflow-auto p-3 font-mono text-[12px] leading-[1.6] text-fg-muted"
            >
              <code>{tokens}</code>
            </pre>
            <p className="border-t border-line px-3 py-2 text-xs text-fg-subtle">
              Reads your key from <code className="font-mono text-fg-muted">${config.provider.keyEnvVar}</code> — it is never
              embedded in the snippet.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
