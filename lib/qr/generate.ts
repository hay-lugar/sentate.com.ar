import QRCode from "qrcode";
import { QR_OPTIONS, QR_PNG_SIZE } from "./config";

/** SVG vectorial (escala sin perder nitidez al imprimir). Incluye el fondo blanco y la zona de silencio. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg" });
}

/** PNG como data URL, para el navegador (usa canvas). */
export function qrPngDataUrl(url: string, size: number = QR_PNG_SIZE): Promise<string> {
  return QRCode.toDataURL(url, { ...QR_OPTIONS, width: size });
}

/** PNG como Buffer, para pruebas en Node. */
export function qrPngBuffer(url: string, size: number = QR_PNG_SIZE): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...QR_OPTIONS, width: size, type: "png" });
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
