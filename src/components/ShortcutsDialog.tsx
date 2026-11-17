import { modKey } from '../lib/format';
import { useUI } from '../lib/store';
import { Dialog, Kbd } from '../ui';

const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'Create',
    rows: [
      [[modKey, '↵'], 'Generate'],
      [[modKey, 'K'], 'Choose a model'],
      [['/'], 'Focus the prompt'],
      [[modKey, 'V'], 'Paste an image as a reference'],
    ],
  },
  {
    title: 'Model palette',
    rows: [
      [['↑', '↓'], 'Move'],
      [['PgUp', 'PgDn'], 'Jump'],
      [[modKey, '1–3'], 'All · Video · Image'],
      [['↵'], 'Select'],
    ],
  },
  {
    title: 'Gallery & viewer',
    rows: [
      [['←', '→'], 'Previous / next'],
      [['F'], 'Fullscreen'],
      [['Shift', 'Click'], 'Select a range'],
      [['Esc'], 'Close / clear selection'],
      [['?'], 'This sheet'],
    ],
  },
];

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const setOpen = useUI((s) => s.setShortcutsOpen);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" size="lg">
      <div className="grid gap-6 px-5 pt-1 pb-5 sm:grid-cols-3">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="label mb-2">{g.title}</h3>
            <dl className="flex flex-col gap-2">
              {g.rows.map(([keys, what]) => (
                <div key={what} className="flex items-center justify-between gap-3">
                  <dt className="text-sm text-fg-muted">{what}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
