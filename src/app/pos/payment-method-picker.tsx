"use client";

import type { LucideIcon } from "lucide-react";

export type PaymentMethodOption<T extends string> = {
  value: T;
  label: string;
  Icon: LucideIcon;
};

export function PaymentMethodPicker<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: PaymentMethodOption<T>[];
  value: T | "";
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map(({ value: optionValue, label, Icon }) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            className={`flex flex-col items-center justify-center gap-1 rounded-md border ${
              compact ? "px-2 py-1.5" : "px-3 py-2.5"
            } ${
              active
                ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                : "border-brand-rosa-claro text-brand-ciruela"
            }`}
          >
            <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
            <span className={compact ? "text-[11px]" : "text-xs"}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
