"use client";

import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, ImageOff, Pencil, Plus, Trash2, UtensilsCrossed, X } from "lucide-react";
import { useState } from "react";
import type { Category } from "@/lib/domain/types";
import { MENU_LIMITS, validateCategoryName } from "@/lib/demo/menu-validation";
import { cn, formatPrice } from "@/lib/format";
import { DishImage } from "@/components/menu/dish-image";
import { FieldError, inputClass } from "@/components/menu/reservation/controls";
import { useDemo } from "./demo-provider";
import { DishFormSheet, type DishFormTarget } from "./dish-form-sheet";
import { Switch } from "./switch";

export function MenuManager() {
  const { state, dispatch, notify } = useDemo();
  const { categories } = state;
  const [formTarget, setFormTarget] = useState<DishFormTarget>(null);
  const [newName, setNewName] = useState("");
  const [newError, setNewError] = useState<string | null>(null);

  const addCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateCategoryName(newName, categories);
    setNewError(error);
    if (error) return;
    dispatch({ type: "addCategory", name: newName });
    notify(`Categoría “${newName.trim()}” creada`);
    setNewName("");
  };

  return (
    <>
      <form onSubmit={addCategory} noValidate className="mb-4 rounded-[1.75rem] bg-surface p-4 shadow-soft ring-1 ring-line/70">
        <label htmlFor="new-category" className="mb-2 block px-1 text-[13px] font-semibold">
          Nueva categoría
        </label>
        <div className="flex gap-2">
          <input
            id="new-category"
            value={newName}
            maxLength={MENU_LIMITS.categoryNameMax + 5}
            onChange={(e) => {
              setNewName(e.target.value);
              setNewError(null);
            }}
            aria-invalid={!!newError}
            aria-describedby={newError ? "new-category-error" : undefined}
            placeholder="Ej: Sugerencias del día"
            className={cn(inputClass, "h-12")}
          />
          <button type="submit" className="pressable inline-flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-brand px-4 text-[14px] font-semibold text-brand-fg shadow-brand">
            <Plus className="size-4" aria-hidden /> Crear
          </button>
        </div>
        <FieldError id="new-category-error">{newError ?? undefined}</FieldError>
      </form>

      {categories.length === 0 ? (
        <div className="flex flex-col items-center rounded-[1.75rem] border-2 border-dashed border-line px-6 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <UtensilsCrossed className="size-6" aria-hidden />
          </span>
          <p className="mt-4 font-display text-lg font-bold">Tu carta está vacía</p>
          <p className="mt-1 text-[14px] text-muted">Creá una categoría para empezar a cargar platos.</p>
        </div>
      ) : (
        <ol className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
          {categories.map((cat, index) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              index={index}
              total={categories.length}
              categories={categories}
              onAddDish={() => setFormTarget({ categoryId: cat.id })}
              onEditDish={(dish) => setFormTarget({ categoryId: cat.id, dish })}
            />
          ))}
        </ol>
      )}

      <DishFormSheet
        target={formTarget}
        categories={categories}
        onClose={() => setFormTarget(null)}
        onSave={({ categoryId, previousCategoryId, dish }) => {
          dispatch({ type: "saveDish", categoryId, previousCategoryId, dish });
          notify(dish.id ? `“${dish.name}” actualizado` : `“${dish.name}” agregado`);
          setFormTarget(null);
        }}
        onDelete={(categoryId, dishId) => {
          dispatch({ type: "deleteDish", categoryId, dishId });
          notify("Plato eliminado", "neutral");
          setFormTarget(null);
        }}
      />
    </>
  );
}

function CategoryCard({
  category: cat,
  index,
  total,
  categories,
  onAddDish,
  onEditDish,
}: {
  category: Category;
  index: number;
  total: number;
  categories: Category[];
  onAddDish: () => void;
  onEditDish: (dish: Category["dishes"][number]) => void;
}) {
  const { dispatch, notify } = useDemo();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(cat.name);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = cat.dishes.filter((d) => d.active).length;
  const headingId = `cat-${cat.id}-name`;

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateCategoryName(name, categories, cat.id);
    setError(err);
    if (err) return;
    dispatch({ type: "renameCategory", categoryId: cat.id, name });
    setRenaming(false);
  };

  const move = (direction: -1 | 1) => {
    dispatch({ type: "moveCategory", categoryId: cat.id, direction });
    notify(`“${cat.name}” movida a la posición ${index + 1 + direction}`, "neutral");
  };

  return (
    <motion.li layout transition={{ type: "spring", stiffness: 400, damping: 36 }} className="rounded-[1.75rem] bg-surface p-2 shadow-soft ring-1 ring-line/70" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 pb-3">
        {renaming ? (
          <form onSubmit={saveName} noValidate className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <label htmlFor={`rename-${cat.id}`} className="sr-only">
              Nombre de la categoría
            </label>
            <input
              id={`rename-${cat.id}`}
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setRenaming(false);
                  setName(cat.name);
                }
              }}
              aria-invalid={!!error}
              aria-describedby={error ? `rename-${cat.id}-error` : undefined}
              className={cn(inputClass, "h-10 min-w-0 flex-1 rounded-xl")}
            />
            <IconButton label="Guardar nombre" type="submit">
              <Check className="size-4" />
            </IconButton>
            <IconButton
              label="Cancelar"
              onClick={() => {
                setRenaming(false);
                setName(cat.name);
                setError(null);
              }}
            >
              <X className="size-4" />
            </IconButton>
            <div className="w-full">
              <FieldError id={`rename-${cat.id}-error`}>{error ?? undefined}</FieldError>
            </div>
          </form>
        ) : (
          <>
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background text-[12px] font-bold text-muted tabular-nums" aria-hidden>
              {index + 1}
            </span>
            <h2 id={headingId} className="min-w-0 flex-1 truncate text-lg font-bold">
              {cat.name}
            </h2>
            <span className="rounded-lg bg-background px-2 py-0.5 text-[12px] font-semibold text-muted">
              {active}/{cat.dishes.length} visibles
            </span>
          </>
        )}
      </div>

      {!renaming && (
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          <IconButton label={`Subir ${cat.name}`} disabled={index === 0} onClick={() => move(-1)}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton label={`Bajar ${cat.name}`} disabled={index === total - 1} onClick={() => move(1)}>
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton
            label={`Renombrar ${cat.name}`}
            onClick={() => {
              setName(cat.name);
              setRenaming(true);
            }}
          >
            <Pencil className="size-4" />
          </IconButton>
          {confirmDelete ? (
            <span className="flex items-center gap-1.5 rounded-xl bg-rose-50 py-1 pr-1 pl-3 text-[12px] font-semibold text-rose-900">
              {cat.dishes.length ? `Borra ${cat.dishes.length} platos.` : "¿Eliminar?"}
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "deleteCategory", categoryId: cat.id });
                  notify(`Categoría “${cat.name}” eliminada`, "neutral");
                }}
                className="pressable h-8 rounded-lg bg-rose-700 px-2.5 text-white"
              >
                Eliminar
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="pressable h-8 rounded-lg px-2.5 ring-1 ring-rose-200">
                No
              </button>
            </span>
          ) : (
            <IconButton label={`Eliminar ${cat.name}`} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
            </IconButton>
          )}
          <button
            type="button"
            onClick={onAddDish}
            className="pressable ml-auto inline-flex h-10 items-center gap-1 rounded-xl px-3 text-[13px] font-semibold text-brand hover:bg-brand-soft"
          >
            <Plus className="size-4" aria-hidden /> Plato<span className="sr-only"> en {cat.name}</span>
          </button>
        </div>
      )}

      {cat.dishes.length === 0 ? (
        <p className="mx-2 mb-2 rounded-2xl border-2 border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
          Sin platos todavía. Esta categoría no se muestra en el menú público.
        </p>
      ) : (
        <ul className="space-y-1">
          {cat.dishes.map((d) => (
            <li key={d.id} className={cn("flex items-center gap-3 rounded-2xl p-2 transition-opacity hover:bg-background", !d.active && "opacity-60")}>
              <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-background text-muted">
                {d.image ? <DishImage src={d.image} alt="" sizes="48px" /> : <ImageOff className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[14px] font-semibold" title={d.name}>
                  {d.name}
                </p>
                <p className="mt-0.5 font-display text-[13px] font-bold text-muted">
                  {formatPrice(d.price)}
                  {!d.active && <span className="ml-2 font-sans text-[11px] font-semibold">· No disponible</span>}
                </p>
              </div>
              <IconButton label={`Editar ${d.name}`} onClick={() => onEditDish(d)}>
                <Pencil className="size-4" />
              </IconButton>
              <Switch
                checked={d.active}
                onChange={() => dispatch({ type: "toggleDish", categoryId: cat.id, dishId: d.id })}
                label={`${d.name} disponible`}
              />
            </li>
          ))}
        </ul>
      )}
    </motion.li>
  );
}

function IconButton({
  label,
  children,
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "pressable grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-background hover:text-foreground disabled:opacity-30 disabled:active:scale-100",
        className,
      )}
      {...props}
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}
