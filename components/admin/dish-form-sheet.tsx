"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { Category, Dish, DishTag } from "@/lib/domain/types";
import { DISH_TAGS } from "@/lib/domain/types";
import { useDemo } from "./demo-provider";
import { MENU_LIMITS, validateDishForm, type DishFormErrors, type DishFormValues } from "@/lib/demo/menu-validation";
import type { DishInput } from "@/lib/demo/state";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { FieldError, inputClass } from "@/components/menu/reservation/controls";
import { cn } from "@/lib/format";
import { Switch } from "./switch";

const TAG_LABEL: Record<DishTag, string> = {
  popular: "Popular",
  nuevo: "Nuevo",
  veggie: "Veggie",
  picante: "Picante",
  "sin-tacc": "Sin TACC",
};

export type DishFormTarget = { categoryId: string; dish?: Dish } | null;

const toValues = (target: NonNullable<DishFormTarget>): DishFormValues => ({
  id: target.dish?.id,
  name: target.dish?.name ?? "",
  description: target.dish?.description ?? "",
  price: target.dish ? String(target.dish.price) : "",
  categoryId: target.categoryId,
  image: target.dish?.image ?? "",
  tags: target.dish?.tags ?? [],
  active: target.dish?.active ?? true,
});

type Props = {
  target: DishFormTarget;
  categories: Category[];
  onClose: () => void;
  onSave: (input: { categoryId: string; previousCategoryId?: string; dish: DishInput }) => void;
  onDelete: (categoryId: string, dishId: string) => void;
};

export function DishFormSheet({ target, categories, onClose, onSave, onDelete }: Props) {
  const { resolveId } = useDemo();
  const [rawValues, setValues] = useState<DishFormValues | null>(null);
  // Si el plato o su categoría se crearon recién, la base pudo confirmar el ID real con el formulario abierto.
  const values = rawValues && { ...rawValues, categoryId: resolveId(rawValues.categoryId), id: rawValues.id && resolveId(rawValues.id) };
  const [errors, setErrors] = useState<DishFormErrors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lastTarget, setLastTarget] = useState<DishFormTarget>(null);

  // Al abrir con un nuevo objetivo, reinicia el formulario (estado derivado en render).
  if (target && target !== lastTarget) {
    setLastTarget(target);
    setValues(toValues(target));
    setErrors({});
    setConfirmDelete(false);
  }

  const isEdit = !!values?.id;
  const set = <K extends keyof DishFormValues>(key: K, value: DishFormValues[K]) => {
    setValues((v) => (v ? { ...v, [key]: value } : v));
    setErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!values) return;
    const result = validateDishForm(values, categories);
    if (!result.ok) {
      setErrors(result.errors);
      const first = Object.keys(result.errors)[0];
      document.getElementById(`dish-${first}`)?.focus();
      return;
    }
    onSave({
      categoryId: values.categoryId,
      previousCategoryId: lastTarget ? resolveId(lastTarget.categoryId) : undefined,
      dish: result.dish,
    });
  };

  const footer = values && (
    <div className="flex gap-3">
      <button type="button" onClick={onClose} className="pressable h-13 flex-1 rounded-2xl bg-background font-semibold ring-1 ring-line">
        Cancelar
      </button>
      <button
        type="submit"
        form="dish-form"
        className="pressable h-13 flex-[1.4] rounded-2xl bg-brand font-display font-bold text-brand-fg shadow-brand"
      >
        {isEdit ? "Guardar cambios" : "Agregar plato"}
      </button>
    </div>
  );

  return (
    <BottomSheet
      open={!!target}
      onClose={onClose}
      label={isEdit ? "Editar plato" : "Nuevo plato"}
      header={<h2 className="text-[22px] font-bold">{isEdit ? "Editar plato" : "Nuevo plato"}</h2>}
      footer={footer}
      initialFocus="#dish-name"
    >
      {values && (
        <form id="dish-form" noValidate onSubmit={submit} className="space-y-4 px-6 pt-2 pb-6">
          <FormField label="Nombre" id="dish-name" error={errors.name} counter={`${values.name.length}/${MENU_LIMITS.dishNameMax}`}>
            <input
              id="dish-name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "dish-name-error" : undefined}
              className={inputClass}
              placeholder="Ej: Milanesa napolitana"
            />
          </FormField>

          <FormField label="Descripción" optional id="dish-description" error={errors.description} counter={`${values.description.length}/${MENU_LIMITS.descriptionMax}`}>
            <textarea
              id="dish-description"
              rows={3}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "dish-description-error" : undefined}
              className={cn(inputClass, "h-auto resize-none py-3.5")}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Precio (ARS)" id="dish-price" error={errors.price}>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-semibold text-muted">
                  $
                </span>
                <input
                  id="dish-price"
                  inputMode="numeric"
                  value={values.price}
                  onChange={(e) => set("price", e.target.value)}
                  aria-invalid={!!errors.price}
                  aria-describedby={errors.price ? "dish-price-error" : undefined}
                  className={cn(inputClass, "pl-8 tabular-nums")}
                  placeholder="12500"
                />
              </div>
            </FormField>
            <FormField label="Categoría" id="dish-categoryId" error={errors.categoryId}>
              <select
                id="dish-categoryId"
                value={values.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                className={cn(inputClass, "appearance-none")}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Imagen (URL https)" optional id="dish-image" error={errors.image}>
            <input
              id="dish-image"
              type="url"
              inputMode="url"
              value={values.image}
              onChange={(e) => set("image", e.target.value)}
              aria-invalid={!!errors.image}
              aria-describedby={errors.image ? "dish-image-error" : undefined}
              className={inputClass}
              placeholder="https://…"
            />
          </FormField>

          <fieldset>
            <legend className="mb-2 px-1 text-[13px] font-semibold">Etiquetas</legend>
            <div className="flex flex-wrap gap-2">
              {DISH_TAGS.map((tag) => {
                const on = values.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("tags", on ? values.tags.filter((t) => t !== tag) : [...values.tags, tag])}
                    className={cn(
                      "pressable h-10 rounded-xl px-3.5 text-[13px] font-semibold ring-1",
                      on ? "bg-brand text-brand-fg ring-brand" : "bg-surface ring-line",
                    )}
                  >
                    {TAG_LABEL[tag]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex items-center justify-between rounded-2xl bg-background p-4">
            <div>
              <p id="dish-active-label" className="text-[14px] font-semibold">
                Disponible
              </p>
              <p className="text-[12px] text-muted">Si lo desactivás, no aparece en el menú público.</p>
            </div>
            <Switch checked={values.active} onChange={() => set("active", !values.active)} labelledBy="dish-active-label" />
          </div>

          {isEdit &&
            (confirmDelete ? (
              <div className="flex items-center gap-2 rounded-2xl bg-rose-50 p-3 text-[13px] text-rose-900">
                <span className="flex-1 font-semibold">¿Eliminar este plato?</span>
                <button
                  type="button"
                  onClick={() => lastTarget && onDelete(resolveId(lastTarget.categoryId), values.id!)}
                  className="pressable h-9 rounded-xl bg-rose-700 px-3 font-semibold text-white"
                >
                  Eliminar
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="pressable h-9 rounded-xl px-3 font-semibold ring-1 ring-rose-200">
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="pressable inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="size-4" aria-hidden /> Eliminar plato
              </button>
            ))}
        </form>
      )}
    </BottomSheet>
  );
}

function FormField({
  label,
  id,
  error,
  optional,
  counter,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  optional?: boolean;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between px-1 text-[13px] font-semibold">
        {label}
        {(optional || counter) && (
          <span className="text-[12px] font-medium text-muted">
            {optional && "Opcional"}
            {optional && counter && " · "}
            {counter}
          </span>
        )}
      </label>
      {children}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
