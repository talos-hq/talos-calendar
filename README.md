# talos-calendar

Slot computation (Python) plus time zone helpers and a dependency-free slot picker
(TypeScript source, so use a bundler such as Vite) for booking pages.

- `talos_calendar.slots` (Python, standard library only): bookable starts from weekly hours, overrides, buffers, limits and busy time, DST-safe, for any object with the `Schedule` fields.
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

Or pin a commit without a submodule, for example
`https://github.com/talos-hq/talos-calendar/archive/<commit>.tar.gz` as the npm or pip source.

Develop with `npm ci`, `npm test`, `npm run typecheck` (Node 22.6 or newer) and
`PYTHONPATH=python python3 -m unittest discover -s test -p "test_*.py"`.
