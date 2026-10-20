/**
 * Tipo REAL de una imagen según sus primeros bytes. El `type` que informa el navegador sale de la extensión
 * y se puede falsear: un .svg renombrado a .jpg no debe pasar.
 */
export type SniffedType = "jpeg" | "png" | "webp" | "gif" | "svg" | "heic" | "unknown";

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

export function sniffImageType(bytes: Uint8Array): SniffedType {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (ascii(bytes, 0, 4) === "GIF8") return "gif";
  if (ascii(bytes, 4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)/.test(ascii(bytes, 8, 12))) return "heic";
  // Texto que arranca como SVG o XML (con o sin BOM / espacios).
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 64)).replace(/^﻿/, "").trimStart().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!doctype svg")) return "svg";
  return "unknown";
}

export const isAllowedType = (t: SniffedType): t is "jpeg" | "png" | "webp" => t === "jpeg" || t === "png" || t === "webp";
