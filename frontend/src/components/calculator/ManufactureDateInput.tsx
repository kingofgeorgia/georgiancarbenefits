"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IMaskMixin } from "react-imask";
import { Popover } from "radix-ui";
import { CalendarDays, ChevronLeft, ChevronRight, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseManufactureMonth } from "@/lib/manufacture-date";

const MaskedInput = IMaskMixin<HTMLInputElement>(({ inputRef, ...props }) => <Input {...props} ref={inputRef} />);
const minimumYear = 1990;

interface Props {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  onBlur: () => void;
  inputRef: (element: HTMLInputElement | null) => void;
  vehicleYear: number;
  error?: string;
}

export function ManufactureDateInput({ value, onChange, onBlur, inputRef, vehicleYear, error }: Props) {
  const t = useTranslations("calculator");
  const locale = useLocale();
  const input = useRef<HTMLInputElement | null>(null);
  const yearSelect = useRef<HTMLSelectElement | null>(null);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const now = new Date();
  const maximumYear = now.getFullYear();
  const selected = parseManufactureMonth(value ?? "");
  const [monthPlaceholder, yearPlaceholder] = t("manufactureDatePlaceholder").split("/");

  function changeOpen(next: boolean) {
    if (next) {
      const year = selected ? Number(selected.slice(0, 4)) : Number(vehicleYear);
      setViewYear(Number.isInteger(year) && year >= minimumYear && year <= maximumYear ? year : maximumYear);
    }
    setOpen(next);
  }

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Anchor asChild>
        <div className="relative">
          <MaskedInput
            id="manufacture-date"
            name="manufacture_date"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder={t("manufactureDatePlaceholder")}
            className="pr-10"
            mask="MM/YYYY"
            blocks={{ MM: { mask: "00", placeholderChar: monthPlaceholder[0] }, YYYY: { mask: "0000", placeholderChar: yearPlaceholder[0] } }}
            lazy={false}
            overwrite={true}
            value={value ?? ""}
            onAccept={(next: string, mask: { unmaskedValue: string }) => onChange(mask.unmaskedValue ? next : null)}
            onBlur={onBlur}
            inputRef={(element: HTMLInputElement | null) => { input.current = element; inputRef(element); }}
            aria-invalid={!!error}
            aria-describedby={error ? "manufacture-date-error" : undefined}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); changeOpen(true); }
            }}
          />
          <Popover.Trigger asChild>
            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" aria-label={t("manufactureDateCalendar")} title={t("manufactureDateCalendar")}>
              <CalendarDays aria-hidden="true" />
            </Button>
          </Popover.Trigger>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          aria-label={t("manufactureDateCalendar")}
          className="z-50 w-72 max-w-[calc(100vw-1rem)] space-y-3 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
          onOpenAutoFocus={(event) => { event.preventDefault(); yearSelect.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); input.current?.focus(); }}
        >
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" disabled={viewYear <= minimumYear} onClick={() => setViewYear((year) => year - 1)} aria-label={t("manufacturePreviousYear")} title={t("manufacturePreviousYear")}><ChevronLeft aria-hidden="true" /></Button>
            <select ref={yearSelect} aria-label={t("manufactureYear")} value={viewYear} onChange={(event) => setViewYear(Number(event.target.value))} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-center text-sm">
              {Array.from({ length: maximumYear - minimumYear + 1 }, (_, index) => <option key={index} value={maximumYear - index}>{maximumYear - index}</option>)}
            </select>
            <Button type="button" variant="ghost" size="icon" disabled={viewYear >= maximumYear} onClick={() => setViewYear((year) => year + 1)} aria-label={t("manufactureNextYear")} title={t("manufactureNextYear")}><ChevronRight aria-hidden="true" /></Button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, month) => {
              const date = new Date(viewYear, month, 1);
              const number = String(month + 1).padStart(2, "0");
              const active = selected === `${viewYear}-${number}-01`;
              return <Button
                key={month}
                type="button"
                variant={active ? "default" : "ghost"}
                className="h-12 min-w-0 flex-col gap-0 px-1"
                aria-label={`${new Intl.DateTimeFormat(locale, { month: "long" }).format(date)} ${viewYear}`}
                aria-pressed={active}
                disabled={viewYear === maximumYear && month > now.getMonth()}
                onClick={() => { onChange(`${number}/${viewYear}`); setOpen(false); }}
              >
                <span className="text-xs opacity-70">{number}</span>
                <span>{new Intl.DateTimeFormat(locale, { month: "short" }).format(date)}</span>
              </Button>;
            })}
          </div>
          <div className="flex justify-end border-t pt-2">
            <Button type="button" variant="ghost" size="icon" onClick={() => { onChange(null); setOpen(false); }} aria-label={t("manufactureDateClear")} title={t("manufactureDateClear")}><Eraser aria-hidden="true" /></Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
