import { el, replaceChildren } from "../dom.js";
import { PLAN, RUN_DAY_ID, WEEKS, dayNumber } from "../plan.js";
import { t } from "../i18n/index.js";

/** Week and day chip rows in the sticky header. */
export function renderSelectors({ elements, prefs, onSelectWeek, onSelectDay }) {
  const { weekLabel, dayLabel, weekSeg, daySeg } = elements;

  weekLabel.textContent = t("header.week");
  dayLabel.textContent = t("header.day");
  weekSeg.setAttribute("aria-label", t("header.week"));
  daySeg.setAttribute("aria-label", t("header.day"));

  const chip = (label, pressed, onClick) =>
    el("button", {
      type: "button",
      class: "chip",
      text: label,
      "aria-pressed": String(pressed),
      on: { click: onClick },
    });

  replaceChildren(
    weekSeg,
    WEEKS.map((week) =>
      chip(t("header.weekChip", { n: week }), prefs.week === week, () => onSelectWeek(week)),
    ),
  );

  replaceChildren(
    daySeg,
    PLAN.map((day) =>
      chip(
        t("header.dayChip", { n: dayNumber(day.id) }),
        prefs.day === day.id,
        () => onSelectDay(day.id),
      ),
    ),
    chip(t("header.runChip"), prefs.day === RUN_DAY_ID, () => onSelectDay(RUN_DAY_ID)),
  );
}
