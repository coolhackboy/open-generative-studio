# Contributing

Thanks for helping improve Open Generative Studio! Bug reports, model fixes, UI polish and docs are all welcome.

## Develop

```bash
git clone https://github.com/coolhackboy/open-generative-studio.git
cd open-generative-studio
npm install
npm run dev            # http://localhost:5173
```

Open `http://localhost:5173/?mock=1` to use **mock mode**: submit, status and upload are simulated with sample
media, so you can work on the UI without an API key or spending credits. `?mock=1&seed=1` fills the gallery with
demo items in every state (finished, running, failed); a prompt containing "fail" produces a failed task.
`?mock=0` turns it off. Mock mode only exists in `npm run dev` and is never bundled into production builds.

Before opening a PR:

```bash
npm run lint
npm run build          # type-checks and builds
```

## Where things live

| Path | What |
| --- | --- |
| `src/ui/` | Generic, brand-agnostic primitives (Button, Dialog, Popover, Segmented…). No product logic. |
| `src/styles/tokens.css` | Design tokens (colors, radius, type) for dark and light themes. |
| `src/components/` | App screens: gallery, composer, model palette, lightbox, settings. |
| `src/lib/api.ts` | The only module that knows the PoYo wire format. |
| `src/lib/schema.ts` | Turns a model's input schema into composer controls, defaults and validation. |
| `src/config.ts` | Brand and backend configuration (read from `VITE_*` env vars). |
| `src/data/catalog.json` | Generated model catalog (schemas, examples, pricing). |

## Guidelines

- Keep `src/ui` free of PoYo- or model-specific code so it stays reusable.
- Use the design tokens (`bg-surface`, `text-fg-muted`, `border-line`, `bg-accent`…) instead of raw colors.
- Keyboard and screen-reader access matter: label controls, keep focus rings, test with Tab and Esc.
- Never log, persist outside `localStorage`, or send the user's API key anywhere except the configured API base.
- If you change `src/data/catalog.json`, run `npm run readme:models` to refresh the README table.

## Reporting issues

Use the issue templates. For model or API errors include the model ID, the request (use **Copy as code** in the
detail panel; it never contains your key), and the error message shown in the app.

By contributing you agree that your contributions are licensed under the MIT License.
