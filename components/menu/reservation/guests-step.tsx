"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RESERVATION_LIMITS } from "@/lib/reservation/validation";
import { Chip, FieldError } from "./controls";

const { minGuests, maxGuests } = RESERVATION_LIMITS;

export function GuestsStep({ guests, onChange, phone, error, max = maxGuests }: { guests: number; onChange: (n: number) => void; phone: string; error?: string; max?: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-2">
        <Button variant="secondary" aria-label="Una persona menos" disabled={guests <= minGuests} onClick={() => onChange(guests - 1)} className="size-12 px-0">
          <Minus className="size-5" aria-hidden />
        </Button>
        <div className="text-center" aria-live="polite">
          <span className="block text-6xl leading-none font-semibold tabular-nums">{guests}</span>
          <span className="mt-2 block type-help">{guests === 1 ? "persona" : "personas"}</span>
        </div>
        <Button variant="secondary" aria-label="Una persona más" disabled={guests >= max} onClick={() => onChange(guests + 1)} className="size-12 px-0">
          <Plus className="size-5" aria-hidden />
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2" role="group" aria-label="Cantidad de personas">
        {Array.from({ length: Math.min(max, 12) }, (_, i) => i + 1).map((n) => (
          <Chip key={n} selected={guests === n} onClick={() => onChange(n)} className="h-12 text-[0.9375rem]" aria-label={`${n} ${n === 1 ? "persona" : "personas"}`}>
            {n}
          </Chip>
        ))}
      </div>
      <FieldError id="err-guests">{error}</FieldError>

      <p className="mt-6 border-t border-line pt-4 type-help">
        ¿Son más de {max}? Llamá al local para grupos grandes:{" "}
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-medium text-foreground underline underline-offset-4">
          {phone}
        </a>
      </p>
    </div>
  );
}
