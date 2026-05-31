"use client";

import { useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { DayPicker } from "react-day-picker";
import { de } from "date-fns/locale";
import { format, parse, isValid } from "date-fns";
import { Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";

type DatePickerProps = {
  /** ISO yyyy-mm-dd string, or empty string */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Allow clearing the selection back to "" */
  clearable?: boolean;
  /** Disable dates before today */
  fromToday?: boolean;
  id?: string;
  className?: string;
  disabled?: boolean;
};

function fromIso(value: string): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

function toIso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Datum wählen",
  clearable = false,
  fromToday = false,
  id,
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = fromIso(value);

  const display = selected
    ? format(selected, "d. MMMM yyyy", { locale: de })
    : "";

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        id={id}
        type="button"
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between gap-2 h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-left text-sm font-medium transition-colors hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed",
          !selected && "text-slate-400 font-normal",
          className,
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Calendar size={16} className="text-slate-400 shrink-0" />
          <span className="truncate">{display || placeholder}</span>
        </span>
        {clearable && selected && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Datum löschen"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChange("");
              }
            }}
            className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
          >
            <X size={16} />
          </span>
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner sideOffset={6} className="isolate z-50">
          <PopoverPrimitive.Popup className="rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 p-3 origin-(--transform-origin) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100">
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (d) {
                  onChange(toIso(d));
                  setOpen(false);
                }
              }}
              locale={de}
              weekStartsOn={1}
              showOutsideDays
              disabled={fromToday ? { before: new Date() } : undefined}
              classNames={{
                root: "text-sm",
                caption_label: "font-semibold text-navy-950",
                nav_button:
                  "h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors",
                weekday: "text-xs font-medium text-slate-400 uppercase tracking-wide",
                day: "h-9 w-9 p-0 text-sm font-medium rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer",
                today: "text-blue-600 font-bold",
                selected:
                  "!bg-blue-600 !text-white hover:!bg-blue-700 hover:!text-white",
                outside: "text-slate-300",
                disabled: "opacity-30 cursor-not-allowed hover:bg-transparent",
              }}
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
