import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveResult } from "@/lib/data/live/result";
import type { PublicTenant } from "@/lib/domain/types";

const live = vi.hoisted(() => ({ result: { status: "not_found" } as LiveResult<PublicTenant> }));
vi.mock("@/lib/data/live/queries", () => ({ getLivePublicTenant: vi.fn(async () => live.result) }));

import { resolvePublicTenant } from "@/lib/data/resolve";
import { TemporaryDataError } from "@/lib/data/live/result";
import { getLivePublicTenant } from "@/lib/data/live/queries";

describe("resolvePublicTenant: ausencia, falla temporal y demo", () => {
  beforeEach(() => vi.mocked(getLivePublicTenant).mockClear());

  it("un slug de demo es siempre la demo (no depende de la base)", async () => {
    live.result = { status: "error", reason: "x" };
    await expect(resolvePublicTenant("el-bodegon")).resolves.toMatchObject({ source: "demo" });
    expect(getLivePublicTenant).not.toHaveBeenCalled();
  });

  it("inexistente → null (404)", async () => {
    live.result = { status: "not_found" };
    await expect(resolvePublicTenant("no-existe")).resolves.toBeNull();
  });

  it("falla de la base → error recuperable, NUNCA 404 ni carta vacía", async () => {
    live.result = { status: "error", reason: "public menu" };
    await expect(resolvePublicTenant("mi-local")).rejects.toBeInstanceOf(TemporaryDataError);
  });

  it("comercio real publicado → live", async () => {
    live.result = { status: "ok", data: { slug: "mi-local", name: "Mi Local" } as PublicTenant };
    await expect(resolvePublicTenant("mi-local")).resolves.toMatchObject({ source: "live", tenant: { name: "Mi Local" } });
  });
});
