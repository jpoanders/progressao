import { el } from "../dom.js";
import { formatNumber, parseNumber } from "../format.js";

/**
 * A numeric text input bound to a stored value.
 *
 * There is no save button anywhere in the app: every keystroke writes through `write`.
 * On blur the field re-reads the stored value so what is displayed is always the rounded
 * number that was actually persisted.
 *
 * `type="text"` with inputMode="decimal" rather than type="number": it keeps the phone's
 * numeric keypad while letting parseNumber accept commas and ignore stray characters.
 */
export function numericField({ label, placeholder, ariaLabel, integer = false, read, write }) {
  const show = () => formatNumber(read(), { integer });

  const input = el("input", {
    type: "text",
    inputMode: "decimal",
    autocomplete: "off",
    placeholder,
    "aria-label": ariaLabel,
    value: show(),
    on: {
      input: () => write(parseNumber(input.value)),
      blur: () => {
        input.value = show();
      },
    },
  });

  const wrap = el("div", { class: "field" }, label ? el("label", { text: label }) : null, input);

  return {
    wrap,
    input,
    /** Refresh the displayed value after a programmatic write (the copy buttons). */
    sync: () => {
      input.value = show();
    },
  };
}
