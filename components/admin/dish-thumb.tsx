"use client";

import { ImageOff } from "lucide-react";
import { DishImage } from "@/components/menu/dish-image";
import { useStorageUrl } from "@/lib/images/use-storage-url";

/** Miniatura de un plato en el panel: firma la ruta de Storage en el navegador (o usa la URL https tal cual). */
export function DishThumb({ image }: { image?: string }) {
  const url = useStorageUrl(image);
  return url ? <DishImage src={url} alt="" sizes="48px" /> : <ImageOff className="size-4" aria-hidden />;
}
