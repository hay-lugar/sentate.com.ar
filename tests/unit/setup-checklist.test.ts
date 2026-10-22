import { describe, expect, it } from "vitest";
import { buildChecklist, requiredPending, type ChecklistInput } from "@/lib/admin/setup-checklist";

const base: ChecklistInput = { slug: "mi-local", missing: [], dishCount: 3, isPublished: true, moderation: "approved", suspended: false, acceptsReservations: true, capacityConfigured: true };

describe("lista de puesta en marcha", () => {
  it("un local completo no tiene pendientes obligatorios", () => {
    expect(requiredPending(buildChecklist(base))).toHaveLength(0);
  });
  it("explica qué falta, con enlace al lugar donde se resuelve", () => {
    const items = buildChecklist({ ...base, missing: ["schedule", "location"], dishCount: 0, isPublished: false, moderation: "draft" });
    const pending = requiredPending(items).map((i) => i.id);
    expect(pending).toEqual(expect.arrayContaining(["horarios", "ubicacion", "carta", "publicar", "revision"]));
    expect(items.find((i) => i.id === "ubicacion")?.href).toBe("/admin/mi-local/explorador");
    expect(items.every((i) => i.why.length > 10)).toBe(true);
  });
  it("las reservas son opcionales: desactivarlas no deja nada pendiente", () => {
    const items = buildChecklist({ ...base, acceptsReservations: false, capacityConfigured: false });
    expect(items.find((i) => i.id === "reservas")).toMatchObject({ done: true, optional: true });
  });
  it("un local suspendido no figura como aprobado", () => {
    expect(buildChecklist({ ...base, suspended: true }).find((i) => i.id === "revision")?.done).toBe(false);
  });
});
