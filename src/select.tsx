import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Option } from "./data";
import { CheckIcon } from "./icons";

type SelectProps<T extends string> = {
  /** Accessible name of the control, e.g. "Idea system". */
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  /** What the trigger button shows. */
  children: ReactNode;
  triggerClassName: string;
  /** Which edge of the trigger the menu lines up with. */
  align?: "start" | "end";
  renderIcon?: (id: T) => ReactNode;
  disabled?: boolean;
  /** Extra text for screen readers on the trigger, e.g. the current value. */
  triggerLabel?: string;
};

/**
 * A listbox popover that follows the WAI-ARIA "select-only combobox" keyboard model:
 * arrows/Home/End move, Enter or Space picks, Escape and Tab close.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  children,
  triggerClassName,
  align = "start",
  renderIcon,
  disabled,
  triggerLabel,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const listId = `sel-${uid}`;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    setActive(Math.max(0, options.findIndex((o) => o.id === value)));
    listRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("pointerdown", onPointer);
    // Only re-run when the menu opens or closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);

  const choose = (index: number) => {
    onChange(options[index].id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onTriggerKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((a) => (a >= last ? 0 : a + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((a) => (a <= 0 ? last : a - 1));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative h-full min-w-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={triggerLabel ?? label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        className={triggerClassName}
      >
        {children}
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className={`absolute top-full z-40 mt-2 max-h-80 w-72 max-w-[calc(100vw-2rem)] overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-pop outline-none motion-safe:animate-pop ${
            align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left"
          }`}
        >
          {options.map((option, index) => {
            const selected = option.id === value;
            return (
              <li
                key={option.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  index === active ? "bg-sunken" : ""
                }`}
              >
                {renderIcon && (
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${selected ? "bg-brand/15 text-brand-ink" : "bg-sunken text-ink-2"}`}>
                    {renderIcon(option.id)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-ink">{option.label}</span>
                  {option.hint && <span className="block text-[13px] text-muted">{option.hint}</span>}
                </span>
                <CheckIcon size={18} className={`shrink-0 text-brand-ink ${selected ? "opacity-100" : "opacity-0"}`} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
