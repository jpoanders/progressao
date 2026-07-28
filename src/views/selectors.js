import { el, replaceChildren } from "../dom.js";
import { dayNumber, weeksOf } from "../plan.js";
import { t } from "../i18n/index.js";

/**
 * Week and day chip rows in the sticky header, built from the active plan — a 6-week,
 * 3-day plan gets six week chips and three day chips with no further wiring.
 */
export function renderSelectors({ elements, plan, week, dayId, onSelectWeek, onSelectDay }) {
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
    weeksOf(plan).map((candidate) =>
      chip(t("header.weekChip", { n: candidate }), week === candidate, () =>
        onSelectWeek(candidate),
      ),
    ),
  );

  replaceChildren(
    daySeg,
    plan.days.map((day) =>
      chip(t("header.dayChip", { n: dayNumber(plan, day.id) }), dayId === day.id, () =>
        onSelectDay(day.id),
      ),
    ),
  );
}
