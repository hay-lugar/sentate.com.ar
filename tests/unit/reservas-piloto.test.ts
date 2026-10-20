import { describe, expect, it } from "vitest";
import { checkIpBudget, clientIpFromHeader, hashClientIp, readRateLimitConfig } from "@/lib/abuse/rate-limit";
import { redact } from "@/lib/log/redact";
import { contactMessage, dayPhrase, telLink, whatsappLink, whatsappTarget } from "@/lib/reservation/contact";
import { reservationErrorInfo } from "@/lib/reservation/errors";

describe("whatsappTarget: solo arma el enlace cuando el número es inequívoco", () => {
  it.each([
    ["+54 9 11 5555-5555", "5491155555555", false],
    ["+5491155555555", "5491155555555", false],
    ["+598 99 123 456", "59899123456", false],
    ["0054 9 11 5555 5555", "5491155555555", false],
    ["+54 11 5555 5555", "541155555555", false], // el "+" manda: no se le agrega nada
    ["5491155555555", "5491155555555", false],
    ["54 11 5555 5555", "5491155555555", false], // 54 sin "+": se agrega el 9 de celulares
  ])("%s → %s (país asumido: %s)", (raw, digits, assumed) => {
    expect(whatsappTarget(raw)).toMatchObject({ digits, assumedCountry: assumed });
  });

  it.each([
    ["11 5555-5555", "5491155555555"],
    ["(011) 5555-5555", "5491155555555"],
    ["011 55555555", "5491155555555"],
    ["351 555 5555", "5493515555555"],
  ])("número local de Argentina %s → asume +54 9 y lo avisa", (raw, digits) => {
    const t = whatsappTarget(raw);
    expect(t).toMatchObject({ digits, assumedCountry: true });
    expect(t?.display).toBe(`+54 9 ${digits.slice(3)}`);
  });

  it.each([
    "11 15 5555 5555", // con el 15 de los celulares: no se adivina dónde termina el área
    "5555-5555", // sin área
    "598 99 123 456", // otro país sin "+"
    "1234567", // muy corto
    "12345678901234567", // muy largo
    "0 11 5555 5555 0",
    "abc",
    "",
  ])("sin enlace para un número ambiguo o inválido: %s", (raw) => {
    expect(whatsappTarget(raw)).toBeNull();
  });

  it("whatsappLink usa wa.me con el número internacional y el texto codificado", () => {
    const t = whatsappTarget("+54 9 11 5555-5555")!;
    expect(whatsappLink(t, "Hola & chau ñ")).toBe("https://wa.me/5491155555555?text=Hola%20%26%20chau%20%C3%B1");
  });

  it("telLink deja solo dígitos y +", () => {
    expect(telLink("+54 (11) 5555-5555")).toBe("tel:+541155555555");
  });
});

describe("contactMessage: propuesta de texto, nunca promete lo que no está confirmado", () => {
  const base = { name: "María José Pérez", tenantName: "El Bodegón", guests: 4, dayLabel: "Hoy", time: "21:30" };

  it("saluda por el primer nombre y dice quién escribe", () => {
    expect(contactMessage({ ...base, status: "pending" })).toContain("Hola María, te escribimos de El Bodegón.");
  });

  it("pendiente: dice que la están revisando; no la da por confirmada", () => {
    const text = contactMessage({ ...base, status: "pending" });
    expect(text).toContain("4 personas hoy a las 21:30");
    expect(text).toContain("La estamos revisando");
    expect(text).not.toMatch(/confirmada|te esperamos/i);
  });

  it("confirmada / rechazada / cancelada tienen su propio texto", () => {
    expect(contactMessage({ ...base, status: "confirmed" })).toContain("está confirmada");
    expect(contactMessage({ ...base, status: "rejected" })).toContain("No podemos confirmar");
    expect(contactMessage({ ...base, status: "cancelled" })).toContain("figura como cancelada");
  });

  it("ningún texto afirma que algo ya se envió", () => {
    for (const status of ["pending", "confirmed", "rejected", "cancelled"] as const) {
      expect(contactMessage({ ...base, status })).not.toMatch(/enviamos|te mandamos|ya te avisamos/i);
    }
  });

  it("una persona va en singular y una fecha lleva 'el'", () => {
    const text = contactMessage({ ...base, guests: 1, dayLabel: "Sáb 24/10", status: "confirmed" });
    expect(text).toContain("1 persona el Sáb 24/10 a las 21:30");
    expect(dayPhrase("Mañana")).toBe("mañana");
    expect(dayPhrase("Vie 23/10")).toBe("el Vie 23/10");
  });
});

describe("límite por conexión: configuración explícita", () => {
  const secret = "s".repeat(40);

  it("con header y secreto: activo, con el header en minúsculas", () => {
    expect(readRateLimitConfig({ RATE_LIMIT_IP_HEADER: "X-Real-IP", RATE_LIMIT_SECRET: secret, NODE_ENV: "production" })).toEqual({
      mode: "on",
      ipHeader: "x-real-ip",
      secret,
    });
  });

  it("apagado solo si se pide de forma explícita", () => {
    expect(readRateLimitConfig({ RATE_LIMIT_MODE: "off", NODE_ENV: "production" })).toEqual({ mode: "off" });
  });

  it("producción sin configurar falla cerrado, no queda desprotegido en silencio", () => {
    expect(readRateLimitConfig({ NODE_ENV: "production" }).mode).toBe("invalid");
  });

  it("fuera de producción sin configurar no limita (desarrollo local)", () => {
    expect(readRateLimitConfig({ NODE_ENV: "development" })).toEqual({ mode: "off" });
    expect(readRateLimitConfig({})).toEqual({ mode: "off" });
  });

  it("header sin secreto, secreto sin header, secreto corto o header inválido: inválido", () => {
    expect(readRateLimitConfig({ RATE_LIMIT_IP_HEADER: "x-real-ip" }).mode).toBe("invalid");
    expect(readRateLimitConfig({ RATE_LIMIT_SECRET: secret }).mode).toBe("invalid");
    expect(readRateLimitConfig({ RATE_LIMIT_IP_HEADER: "x-real-ip", RATE_LIMIT_SECRET: "corto" }).mode).toBe("invalid");
    expect(readRateLimitConfig({ RATE_LIMIT_IP_HEADER: "x real ip", RATE_LIMIT_SECRET: secret }).mode).toBe("invalid");
  });
});

describe("clientIpFromHeader e hashClientIp", () => {
  it("lee IPv4 e IPv6, con espacios, corchetes y zona", () => {
    expect(clientIpFromHeader("203.0.113.10")).toBe("203.0.113.10");
    expect(clientIpFromHeader("  2001:DB8::1  ")).toBe("2001:db8::1");
    expect(clientIpFromHeader("[2001:db8::1]")).toBe("2001:db8::1");
    expect(clientIpFromHeader("fe80::1%eth0")).toBe("fe80::1");
  });

  it("una IPv4 mapeada en IPv6 cuenta como la misma conexión", () => {
    expect(clientIpFromHeader("::ffff:203.0.113.10")).toBe("203.0.113.10");
  });

  it("con una lista toma la primera", () => {
    expect(clientIpFromHeader("203.0.113.10, 70.41.3.18")).toBe("203.0.113.10");
  });

  it.each(["", "   ", "no-es-ip", "999.1.1.1", "1.2.3", "<script>", null, undefined])("valor inválido o ausente: %s", (value) => {
    expect(clientIpFromHeader(value as string | null | undefined)).toBeNull();
  });

  it("el hash es un HMAC hex de 64 caracteres, estable, distinto por IP y por secreto, y no contiene la IP", () => {
    const a = hashClientIp("203.0.113.10", "secreto-uno-".repeat(4));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashClientIp("203.0.113.10", "secreto-uno-".repeat(4))).toBe(a);
    expect(hashClientIp("203.0.113.11", "secreto-uno-".repeat(4))).not.toBe(a);
    expect(hashClientIp("203.0.113.10", "secreto-dos-".repeat(4))).not.toBe(a);
    expect(a).not.toContain("203");
  });
});

describe("checkIpBudget: la compuerta del formulario público", () => {
  const env = { RATE_LIMIT_IP_HEADER: "x-test-ip", RATE_LIMIT_SECRET: "k".repeat(40), NODE_ENV: "production" };
  const ok = async () => ({ data: { allowed: true }, error: null });
  const logs: string[] = [];
  const log = (m: string) => logs.push(m);

  it("deja pasar si hay cupo y consulta la base con el HMAC, no con la IP", async () => {
    let received = "";
    const gate = await checkIpBudget({
      env,
      header: (n) => (n === "x-test-ip" ? "203.0.113.10" : null),
      consume: async (key) => {
        received = key;
        return { data: { allowed: true, remaining: 11 }, error: null };
      },
      log,
    });
    expect(gate).toEqual({ ok: true });
    expect(received).toBe(hashClientIp("203.0.113.10", env.RATE_LIMIT_SECRET));
    expect(received).not.toContain("203");
  });

  it("bloquea cuando la base dice que no hay cupo", async () => {
    const gate = await checkIpBudget({ env, header: () => "203.0.113.10", consume: async () => ({ data: { allowed: false, window: "10m" }, error: null }), log });
    expect(gate).toEqual({ ok: false, code: "ip_rate_limited" });
  });

  it("falla cerrado si falta el header: no deja pasar sin límite", async () => {
    expect(await checkIpBudget({ env, header: () => null, consume: ok, log })).toEqual({ ok: false, code: "service_unavailable" });
  });

  it("falla cerrado si el header no trae una IP", async () => {
    expect(await checkIpBudget({ env, header: () => "no-es-ip", consume: ok, log })).toEqual({ ok: false, code: "service_unavailable" });
  });

  it("falla cerrado si la configuración es inválida (producción sin configurar)", async () => {
    expect(await checkIpBudget({ env: { NODE_ENV: "production" }, header: () => "203.0.113.10", consume: ok, log })).toEqual({
      ok: false,
      code: "service_unavailable",
    });
  });

  it("falla cerrado si la base da error, y no filtra el detalle", async () => {
    const gate = await checkIpBudget({ env, header: () => "203.0.113.10", consume: async () => ({ data: null, error: { code: "XX000" } }), log });
    expect(gate).toEqual({ ok: false, code: "unexpected" });
  });

  it("apagado explícito: deja pasar sin consultar la base", async () => {
    let called = false;
    const gate = await checkIpBudget({
      env: { RATE_LIMIT_MODE: "off", NODE_ENV: "production" },
      header: () => null,
      consume: async () => {
        called = true;
        return { data: null, error: null };
      },
      log,
    });
    expect(gate).toEqual({ ok: true });
    expect(called).toBe(false);
  });

  it("los logs de la compuerta nunca contienen la IP, su hash ni el secreto", async () => {
    logs.length = 0;
    await checkIpBudget({ env, header: () => "203.0.113.10", consume: async () => ({ data: null, error: { code: "XX000" } }), log });
    await checkIpBudget({ env, header: () => "basura", consume: ok, log });
    await checkIpBudget({ env: { NODE_ENV: "production" }, header: () => "203.0.113.10", consume: ok, log });
    expect(logs.length).toBeGreaterThan(0);
    const all = logs.join("\n");
    expect(all).not.toContain("203.0.113.10");
    expect(all).not.toContain(hashClientIp("203.0.113.10", env.RATE_LIMIT_SECRET));
    expect(all).not.toContain(env.RATE_LIMIT_SECRET);
  });
});

describe("mensajes del formulario público para los códigos nuevos", () => {
  it("ip_rate_limited y service_unavailable se pueden reintentar y sugieren llamar al local", () => {
    for (const code of ["ip_rate_limited", "service_unavailable"]) {
      const info = reservationErrorInfo(code);
      expect(info.retryable).toBe(true);
      expect(info.message).toMatch(/llamá al local/);
    }
  });
});

describe("redact: lo que no debe quedar en los logs", () => {
  it.each([
    ["error con +54 9 11 5555-5555 y más", "[número]"],
    ["fallo para maria.perez@example.com", "[email]"],
    ["Failing row contains (11 4000 0000)", "[número]"],
    ["token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk", "[token]"],
    ["clave sb_secret_AbCdEf123456", "[clave]"],
    [`hash ${"a".repeat(64)}`, "[hex]"],
  ])("%s", (input, marker) => {
    const out = redact(input);
    expect(out).toContain(marker);
    expect(out).not.toMatch(/5555|maria\.perez|11 4000|eyJhbGci|AbCdEf|a{32}/);
  });

  it("deja pasar un mensaje técnico común y recorta los largos", () => {
    expect(redact("duplicate key value violates unique constraint")).toBe("duplicate key value violates unique constraint");
    expect(redact("x".repeat(1000))).toHaveLength(300);
    expect(redact(undefined)).toBe("");
  });
});
