# Frontend — responsive layout conventions

React + Vite, plain CSS (no Tailwind/CSS-in-JS). Global styles live in
`src/App.css`; the marketing landing page is self-contained in the repo-root
`index.html`.

There are **three front-ends served from one React build**, each mounted on its
own root component:

| App       | Root component     | Audience  | Layout policy                         |
| --------- | ------------------ | --------- | ------------------------------------- |
| Customer  | `App.tsx`          | Guests    | **Strictly mobile** — phone frame only |
| Manager   | `ManagerApp.tsx`   | Staff     | **Mobile *and* desktop** (responsive)  |
| Admin     | `AdminApp.tsx`     | Owners    | **Mobile *and* desktop** (responsive)  |

## The rule

- **Customer screens stay phone-only.** They render inside `<div className="app">`
  and must look and behave as a centred phone-width column on every screen size.
  Do **not** add desktop breakpoints that widen customer UI. On screens wider
  than a phone the customer app is deliberately framed as a centred device strip
  (see `.app` / the `@media (min-width: 500px)` frame rule in `App.css`).

- **Manager + Admin screens must work on both phone and desktop.** They render
  inside `<div className="app dashboard">`. On phones they match the customer
  phone layout; on tablets/desktops they widen to use the available screen and
  flow content into columns.

## The method (follow this for consistency)

The customer and dashboard apps share the same base `.app` wrapper and many of
the same components (e.g. `MenuBrowser`). The *only* thing that distinguishes a
dashboard is the extra **`dashboard` modifier class** on the root wrapper:

```tsx
// ManagerApp.tsx / AdminApp.tsx
<div className="app dashboard"> … </div>

// App.tsx (customer) — never add `dashboard` here
<div className="app"> … </div>
```

All desktop/responsive behaviour is pure CSS, **scoped under `.app.dashboard`**,
and lives in one clearly-marked block at the **end of `src/App.css`**
(`Responsive dashboards (Manager + Admin)`). Rules are placed last so they win
over the earlier `.app` phone-frame rules by source order and specificity
(`.app.dashboard` = 0,2,0 beats `.app` = 0,1,0).

What that block does today:

1. **Widen the container** — `.app.dashboard` drops the 430px phone-strip cap and
   the device shadow at `≥500px` (→ `760px`), then goes to `1140px` at `≥1024px`.
2. **Columnise lists** — `.app.dashboard .order-list` / `.oos-list` become grids
   (1 col → 2 at `≥760px` → orders 3 at `≥1100px`); `.admin-tiles` → 3 cols at
   `≥1100px`. Use `align-items: start` so an expanded card doesn't stretch its
   row-mates.
3. **Menu browser** — `MenuBrowser` is shared with the customer app, so the
   dish grid is widened only via `.app.dashboard .dish-grid` (2 → 3 at `≥760px`
   → 4 at `≥1100px`). The customer copy keeps its 2-column phone grid.

### Rules for adding new UI

- **New customer screen:** build it phone-width. No desktop breakpoints. It will
  render inside `.app` and stay in the phone frame automatically.
- **New manager/admin screen:** build the **mobile layout first** (it renders in
  `.app` width on phones for free). To use desktop space, add rules **scoped to
  `.app.dashboard`** in the responsive block at the end of `App.css` — never
  unscoped, or you'll leak desktop styling into the customer app.
- **Shared component used by both** (like `MenuBrowser`): keep the base styles
  phone-first and shared. Put any desktop-only widening behind `.app.dashboard`
  so the customer rendering is untouched.
- **Breakpoints:** reuse the existing ladder — `500px` (phone → wide),
  `760px` (two-up grids), `1024px`/`1100px` (full-width, three/four-up). The
  mobile layout is the default (mobile-first); breakpoints only add width.
- **Never** gate customer-vs-dashboard differences in JS/viewport checks when CSS
  scoping under `.app.dashboard` will do — it's simpler and avoids layout flicker.

### Sanity check after layout changes

Run `npm run build` (that's `tsc -b && vite build`) and test in the DevTools
device toolbar at **375px, 768px, and 1280px**: the customer app must stay a
centred phone column at all three; manager/admin must be a phone column at 375px
and fill the screen at 1280px.
