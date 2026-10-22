import { describe, expect, it } from "vitest";
import { leaveCreateLocalPath, parseIntent, postLoginPath, postSignupPath } from "@/lib/auth/destinations";

describe("destinos de autenticación", () => {
  it("solo la elección explícita «local» lleva al alta de un local", () => {
    expect(parseIntent("local")).toBe("local");
    for (const v of [undefined, null, "", "comensal", "LOCAL", "admin", 1]) expect(parseIntent(v)).toBe("comensal");
    expect(postSignupPath("local")).toBe("/registro/local");
    expect(postSignupPath("comensal")).toBe("/cuenta");
  });

  it("tras ingresar: lo pedido, o el panel si administra locales, o su cuenta (nunca el alta)", () => {
    expect(postLoginPath({ next: "/cuenta/favoritos", hasTenants: true })).toBe("/cuenta/favoritos");
    expect(postLoginPath({ next: null, hasTenants: true })).toBe("/admin");
    expect(postLoginPath({ next: null, hasTenants: false })).toBe("/cuenta");
    expect(postLoginPath({ hasTenants: false })).not.toContain("registro");
  });

  it("quien no quiere crear un local vuelve a su panel o a su cuenta", () => {
    expect(leaveCreateLocalPath("mi-local")).toBe("/admin/mi-local");
    expect(leaveCreateLocalPath(null)).toBe("/cuenta");
  });
});
