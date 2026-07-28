import { el, fragment } from "../dom.js";
import { formatNumber } from "../format.js";
import { WEEKS } from "../plan.js";
import { RUN_FIELDS } from "../state.js";
import { t } from "../i18n/index.js";
import { numericField } from "./fields.js";

/** Cycles are whole numbers; distance and time keep a decimal. */
const INTEGER_FIELDS = new Set(["cycles"]);

const protocolFor = (week) => ({
  protocol: t(`plan.running.${week}.protocol`),
  reps: t(`plan.running.${week}.reps`),
  total: t(`plan.running.${week}.total`),
});

/** The plan panel: this week's protocol in full, plus all four weeks for context. */
function protocolPanel(week) {
  const current = protocolFor(week);

  return el(
    "div",
    { class: "run" },
    el("h2", { text: t("run.title") }),
    el("div", {
      class: "proto",
      text: t("run.protocol", { protocol: current.protocol, reps: current.reps }),
    }),
    current.total ? el("div", { class: "note", text: t("run.totalNote", current) }) : null,
    el(
      "ul",
      {},
      WEEKS.map((candidate) => {
        const entry = protocolFor(candidate);
        const key = entry.total ? "run.weekItemTotal" : "run.weekItem";
        return el("li", {
          class: candidate === week ? "active" : null,
          text: t(key, { week: candidate, ...entry }),
        });
      }),
    ),
  );
}

/** "↳ last time (W1): 3.2 km · 22 min · 7 cycles" */
function previousRunText(previous) {
  const parts = [];
  if (previous.dist != null) {
    parts.push(t("run.valueDist", { value: formatNumber(previous.dist) }));
  }
  if (previous.time != null) {
    parts.push(t("run.valueTime", { value: formatNumber(previous.time) }));
  }
  if (previous.cycles != null) {
    parts.push(t("run.valueCycles", { n: Math.round(previous.cycles) }));
  }
  return t("run.previous", { week: previous.week, values: parts.join(" · ") });
}

function logCard({ store, week }) {
  const current = protocolFor(week);

  const controls = new Map(
    RUN_FIELDS.map((field) => {
      const integer = INTEGER_FIELDS.has(field);
      const label = t(`run.fields.${field}.label`);
      const unit = t(`run.fields.${field}.unit`);
      return [
        field,
        numericField({
          label: unit ? `${label} (${unit})` : label,
          placeholder: t(`run.fields.${field}.placeholder`),
          ariaLabel: t("run.fieldAria", { field: label }),
          integer,
          read: () => store.getRun(week)?.[field] ?? null,
          write: (value) => store.setRunField(week, field, value),
        }),
      ];
    }),
  );

  const previous = store.findPreviousRun(week);
  const previousBlock = previous
    ? el(
        "div",
        { class: "prev-row" },
        el("div", { class: "prev", text: previousRunText(previous) }),
        el("button", {
          type: "button",
          class: "copy-btn",
          text: t("exercise.copy"),
          "aria-label": t("run.copyAria"),
          on: {
            click: () => {
              for (const field of RUN_FIELDS) {
                if (previous[field] == null) continue;
                store.setRunField(week, field, previous[field]);
                controls.get(field).sync();
              }
            },
          },
        }),
      )
    : el("div", { class: "prev empty standalone", text: t("run.previousEmpty") });

  return el(
    "section",
    { class: "exercise" },
    el(
      "div",
      { class: "ex-head" },
      el("h2", { class: "ex-name", text: t("run.logTitle") }),
      el("span", { class: "ex-scheme", text: t("run.target", { reps: current.reps }) }),
    ),
    el(
      "div",
      { class: "run-form" },
      RUN_FIELDS.map((field) => controls.get(field).wrap),
    ),
    previousBlock,
  );
}

/** The running session: protocol reference, this week's log, and the clear action. */
export function renderRunningView({ store, week, onClearRun }) {
  return fragment(
    protocolPanel(week),
    logCard({ store, week }),
    el(
      "div",
      { class: "clear-wrap" },
      el("button", {
        type: "button",
        class: "btn danger full",
        text: t("run.clear", { week }),
        on: { click: () => onClearRun(week) },
      }),
    ),
  );
}
