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
export function numericField({
  label,
  placeholder,
  ariaLabel,
  describedBy,
  integer = false,
  read,
  write,
  onChange,
}) {
  const show = () => formatNumber(read(), { integer });

  const input = el("input", {
    type: "text",
    inputMode: "decimal",
    autocomplete: "off",
    placeholder,
    "aria-label": ariaLabel,
    "aria-describedby": describedBy,
    value: show(),
    on: {
      input: () => {
        write(parseNumber(input.value));
        // Lets the caller react to the new value without a render(), which would take the
        // keyboard away mid-word.
        onChange?.();
      },
      blur: () => {
        input.value = show();
      },
    },
  });

  const wrap = el("div", { class: "field" }, label ? el("label", { text: label }) : null, input);

  return {
    wrap,
    input,
    /** Refresh the displayed value after a programmatic write (the ghost row). */
    sync: () => {
      input.value = show();
      onChange?.();
    },
  };
}
