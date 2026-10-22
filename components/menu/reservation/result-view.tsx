"use client";

import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/config/brand";
import { describeSlot } from "@/lib/domain/schedule";
import type { SubmittedSummary } from "./use-reservation-request";

export function SubmittedView({
  tenantName,
  tenantPhone,
  summary,
  live,
  onClose,
}: {
  tenantName: string;
  /** Teléfono público del local (el mismo que muestra la carta). */
  tenantPhone?: string;
  summary: SubmittedSummary;
  live: boolean;
  onClose: () => void;
}) {
  return (
    <div className="px-6 pb-safe" role="status">
      <span className="mt-1 grid size-12 place-items-center rounded-full border border-line-strong">
        <Check className="size-6" aria-hidden />
      </span>

      <h2 className="mt-4 type-heading">{live ? "Solicitud enviada" : "Solicitud simulada"}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        {live ? (
          <>
            Gracias, {summary.firstName}. {tenantName} recibió tu pedido. <b className="font-semibold text-foreground">Todavía no es una reserva:</b> no
            hay una mesa guardada para vos hasta que el local la confirme.
            {summary.notify && " Te escribimos por email cuando responda; si no te llega, revisá el correo no deseado o llamá al local."}
          </>
        ) : (
          <>
            Gracias, {summary.firstName}. Como esto es una demo, <b className="font-semibold text-foreground">la solicitud no se envió a {tenantName}</b> y
            no se guardaron tus datos.
          </>
        )}
      </p>

      <dl className="mt-5 divide-y divide-line rounded-xl border border-line text-[15px]">
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">Estado</dt>
          <dd className="font-medium">Solicitud pendiente</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">Local</dt>
          <dd className="font-medium">{tenantName}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">Personas</dt>
          <dd className="font-medium">{summary.guests}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">Turno</dt>
          <dd className="text-right font-medium">{describeSlot(summary.slot)}</dd>
        </div>
      </dl>

      {live ? (
        <div className="mt-5 text-[14px] leading-relaxed text-muted">
          <h3 className="text-[15px] font-semibold text-foreground">¿Cómo te enterás de la respuesta?</h3>
          <p className="mt-1.5">
            El local revisa las solicitudes por su cuenta y, si puede recibirte, se comunica con vos al teléfono que dejaste (llamada o WhatsApp).{" "}
            <b className="font-semibold text-foreground">{BRAND.name} todavía no envía mensajes ni emails automáticos</b>, y no hay una pantalla para seguir el
            estado.
          </p>
          <p className="mt-1.5">
            Si no tenés novedades, llamá al local
            {tenantPhone ? (
              <>
                :{" "}
                <a href={`tel:${tenantPhone.replace(/[^\d+]/g, "")}`} className="font-medium text-foreground underline underline-offset-4">
                  {tenantPhone}
                </a>
              </>
            ) : null}
            .
          </p>
        </div>
      ) : (
        <p className="mt-5 text-[14px] leading-relaxed text-muted">
          En el producto real, una solicitud queda <b className="font-semibold text-foreground">pendiente</b> hasta que el local la acepta. Recién ahí es
          una <b className="font-semibold text-foreground">reserva confirmada</b>.
        </p>
      )}

      <Button size="lg" onClick={onClose} className="mt-6 mb-2 w-full">
        Volver al menú
      </Button>
    </div>
  );
}

export function FailedView({
  message,
  onRetry,
  onBack,
  retrying,
}: {
  message: string | null;
  onRetry: () => void;
  onBack: () => void;
  retrying: boolean;
}) {
  return (
    <div className="px-6 pb-safe" role="alert">
      <span className="mt-1 grid size-12 place-items-center rounded-full border border-danger/50 text-danger">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h2 className="mt-4 type-heading">No pudimos enviar la solicitud</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{message ?? "Algo salió mal."} Tus datos siguen cargados: podés reintentar.</p>
      <div className="mt-6 mb-2 flex gap-3">
        <Button variant="secondary" size="lg" onClick={onBack} className="flex-1">
          Revisar datos
        </Button>
        <Button size="lg" onClick={onRetry} pending={retrying} className="flex-1">
          Reintentar
        </Button>
      </div>
    </div>
  );
}
