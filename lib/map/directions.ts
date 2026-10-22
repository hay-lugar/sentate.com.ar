/** Enlace «Cómo llegar»: con la ubicación confirmada del local usa sus coordenadas; si no, la dirección escrita. */
export function directionsUrl(tenant: { address: string; discovery?: { lat: number; lng: number } }): string {
  const q = tenant.discovery ? `${tenant.discovery.lat},${tenant.discovery.lng}` : tenant.address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
