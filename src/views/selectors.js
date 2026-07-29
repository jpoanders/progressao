import { el, replaceChildren } from "../dom.js";
import { dayLabel, weeksOf } from "../plan.js";
import { loggedDays, loggedWeeks } from "../state.js";
import { t } from "../i18n/index.js";

/**
 * Week and day chip rows in the sticky header, built from the active plan — a 6-week,
 * 3-day plan gets six week chips and three day chips with no further wiring.
 *
 * A chip you have already logged something against is marked. The mark is a dot in --ghost,
 * not a colour: colour is spent on the gain badge alone (see styles/app.css). Since a dot
 * says nothing to a screen reader, every chip also carries a spoken label that states it.
 */
export function renderSelectors({ elements, store, plan, week, dayId, onSelectWeek, onSelectDay }) {
  const { weekLabel, dayLabel: dayLegend, weekSeg, daySeg } = elements;

  weekLabel.textContent = t("header.week");
  dayLegend.textContent = t("header.day");
  weekSeg.setAttribute("aria-label", t("header.week"));
  daySeg.setAttribute("aria-label", t("header.day"));

  const chip = (label, spoken, { pressed, logged }, onClick) =>
    el("button", {
      type: "button",
      class: `chip${logged ? " chip--logged" : ""}`,
      text: label,
      "aria-pressed": String(pressed),
      "aria-label": logged ? t("header.chipLogged", { label: spoken }) : spoken,
      on: { click: onClick },
    });

  const weeksWithRecords = loggedWeeks(store.state, plan);
  const daysWithRecords = loggedDays(store.state, plan, week);

  replaceChildren(
    weekSeg,
    weeksOf(plan).map((candidate) =>
      chip(
        t("header.weekChip", { n: candidate }),
        t("header.weekAria", { n: candidate }),
        { pressed: week === candidate, logged: weeksWithRecords.has(candidate) },
        () => onSelectWeek(candidate),
      ),
    ),
  );

  replaceChildren(
    daySeg,
    plan.days.map((day) => {
      const label = dayLabel(plan, day);
      return chip(
        label,
        label,
        { pressed: dayId === day.id, logged: daysWithRecords.has(day.id) },
        () => onSelectDay(day.id),
      );
    }),
  );
}
