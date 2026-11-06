// Slot picker: time zone select, month grid of days with slots, and the slot list for a day.

import { h } from "./dom";
import { dayKey, formatDayKey, formatMonth, formatTime, groupByDay, saveTz, timezoneOptions } from "./time";

function nowIn(tz: string): string {
  return formatTime(new Date().toISOString(), tz);
}

export interface PickerOptions {
  container: HTMLElement;
  slots: string[];
  tz: string;
  onPick: (slot: string) => void;
  onTzChange?: (tz: string) => void;
  /** Always show times in opts.tz; the zone is shown but cannot be changed. */
  lockTz?: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export class SlotPicker {
  private slots: string[];
  private tz: string;
  private year = 0;
  private month = 0;
  private selectedDay: string | null = null;
  private selectedSlot: string | null = null;
  private clockEl: HTMLElement | null = null;
  private clockTimer = 0;
  private busy = false;

  constructor(private readonly opts: PickerOptions) {
    this.slots = opts.slots;
    this.tz = opts.tz;
    this.resetMonth();
    this.render();
    // Live local time next to the zone, refreshed each minute.
    this.clockTimer = window.setInterval(() => {
      if (!this.opts.container.isConnected) {
        this.destroy();
        return;
      }
      if (this.clockEl) this.clockEl.textContent = `(${nowIn(this.tz)})`;
    }, 60_000);
  }

  /** Stops the clock timer. */
  destroy(): void {
    window.clearInterval(this.clockTimer);
  }

  /** The zone the picker currently shows times in. */
  currentTz(): string {
    return this.tz;
  }

  /** While busy (a request is in flight) picks are ignored and the picker is inert. */
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.opts.container.toggleAttribute("inert", busy);
    this.opts.container.setAttribute("aria-busy", String(busy));
  }

  setSlots(slots: string[]): void {
    this.slots = slots;
    if (this.selectedSlot && !slots.includes(this.selectedSlot)) this.selectedSlot = null;
    const groups = groupByDay(this.slots, this.tz);
    if (this.selectedDay && !groups.has(this.selectedDay)) this.selectedDay = null;
    if (!this.selectedDay) this.resetMonth();
    this.render();
  }

  private resetMonth(): void {
    const key = this.slots.length ? dayKey(this.slots[0], this.tz) : dayKey(new Date().toISOString(), this.tz);
    this.year = Number(key.slice(0, 4));
    this.month = Number(key.slice(5, 7)) - 1;
  }

  private monthBounds(): { first: number; last: number } {
    if (!this.slots.length) {
      const current = this.year * 12 + this.month;
      return { first: current, last: current };
    }
    const toIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
    return {
      first: toIndex(dayKey(this.slots[0], this.tz)),
      last: toIndex(dayKey(this.slots[this.slots.length - 1], this.tz)),
    };
  }

  private render(): void {
    const groups = groupByDay(this.slots, this.tz);
    const select = h("select", {
      "data-testid": "tz-select",
      "aria-label": "Time zone",
      disabled: this.opts.lockTz === true,
      title: this.opts.lockTz ? "Times are shown in this time zone" : undefined,
    });
    for (const zone of timezoneOptions(this.tz)) {
      select.append(h("option", { value: zone, selected: zone === this.tz }, zone.replace(/_/g, " ")));
    }
    select.addEventListener("change", () => {
      this.tz = select.value;
      saveTz(this.tz);
      this.selectedDay = null;
      this.selectedSlot = null;
      this.resetMonth();
      this.opts.onTzChange?.(this.tz);
      this.render();
    });

    this.clockEl = h("span", { class: "tz-now", "data-testid": "tz-now" }, `(${nowIn(this.tz)})`);
    const children: Node[] = [h("label", { class: "tz" }, "Time zone ", select, this.clockEl)];
    if (!this.slots.length) {
      children.push(h("p", { class: "muted", "data-testid": "no-slots" }, "No times are available right now. Please check back soon."));
      this.opts.container.replaceChildren(...children);
      return;
    }
    children.push(h("div", { class: "picker" }, this.renderCalendar(groups), this.renderSlotList(groups)));
    this.opts.container.replaceChildren(...children);
  }

  private renderCalendar(groups: Map<string, string[]>): HTMLElement {
    const { first, last } = this.monthBounds();
    const index = this.year * 12 + this.month;
    const prev = h("button", { type: "button", class: "nav", "data-testid": "prev-month", "aria-label": "Previous month", disabled: index <= first }, "‹");
    const next = h("button", { type: "button", class: "nav", "data-testid": "next-month", "aria-label": "Next month", disabled: index >= last }, "›");
    prev.addEventListener("click", () => this.shiftMonth(-1));
    next.addEventListener("click", () => this.shiftMonth(1));

    const grid = h("div", { class: "grid", "data-testid": "calendar" });
    for (const name of WEEKDAYS) grid.append(h("span", { class: "weekday" }, name));
    const firstWeekday = new Date(Date.UTC(this.year, this.month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(this.year, this.month + 1, 0)).getUTCDate();
    for (let i = 0; i < firstWeekday; i++) grid.append(h("span", { class: "blank" }));
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${this.year}-${String(this.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const available = groups.has(key);
      const button = h(
        "button",
        {
          type: "button",
          class: `day${key === this.selectedDay ? " selected" : ""}`,
          "data-testid": available ? "day" : "day-unavailable",
          "data-day": key,
          disabled: !available,
          "aria-label": formatDayKey(key),
        },
        String(day),
      );
      if (available) {
        button.addEventListener("click", () => {
          this.selectedDay = key;
          this.selectedSlot = null;
          this.render();
        });
      }
      // Stable per-day hook (the button keeps data-testid="day" for existing tests).
      button.replaceChildren(h("span", { "data-testid": `day-${key}` }, String(day)));
      grid.append(button);
    }
    return h(
      "div",
      { class: "calendar" },
      h("div", { class: "month-nav" }, prev, h("span", { "data-testid": "month-label" }, formatMonth(this.year, this.month)), next),
      grid,
    );
  }

  private renderSlotList(groups: Map<string, string[]>): HTMLElement {
    const list = h("div", { class: "slots", "data-testid": "slot-list" });
    if (!this.selectedDay) {
      list.append(h("p", { class: "muted" }, "Pick a day to see available times."));
      return list;
    }
    list.append(h("h3", {}, formatDayKey(this.selectedDay)));
    for (const slot of groups.get(this.selectedDay) ?? []) {
      const button = h(
        "button",
        { type: "button", class: `slot${slot === this.selectedSlot ? " selected" : ""}`, "data-testid": "slot", "data-start": slot },
        formatTime(slot, this.tz),
      );
      button.addEventListener("click", () => {
        if (this.busy) return;
        this.selectedSlot = slot;
        this.render();
        this.opts.onPick(slot);
      });
      list.append(button);
    }
    return list;
  }

  private shiftMonth(delta: number): void {
    const index = this.year * 12 + this.month + delta;
    this.year = Math.floor(index / 12);
    this.month = index % 12;
    this.render();
  }
}
