# talos-calendar

Time zone helpers and a dependency-free slot picker for booking pages. It ships
TypeScript source, so use it with a bundler such as Vite.

- `talos-calendar/time`: pick, remember and format IANA zones, group UTC slots by local day.
- `talos-calendar/picker`: `SlotPicker`, a month grid and slot list in the visitor's zone.
- `talos-calendar/dom`: the small `h()` element helper the picker uses.

Your API supplies slots as UTC ISO strings; this package only displays them. The
picker uses plain class names and has no stylesheet of its own.

Use it as a git submodule plus a local npm dependency:

```bash
git submodule add https://github.com/talos-hq/talos-calendar vendor/talos-calendar
npm install ./vendor/talos-calendar
```

```ts
import { SlotPicker } from "talos-calendar/picker";
import { loadTz } from "talos-calendar/time";
```

Develop with `npm ci`, `npm test` and `npm run typecheck`. Tests need Node 22.6 or newer.
