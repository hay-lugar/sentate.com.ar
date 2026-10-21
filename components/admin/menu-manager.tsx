"use client";

import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { Category } from "@/lib/domain/types";
import { MENU_LIMITS, validateCategoryName } from "@/lib/demo/menu-validation";
import { cn, formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { FieldError, inputClass } from "@/components/menu/reservation/controls";
import { useDemo } from "./demo-provider";
import { DishFormSheet, type DishFormTarget } from "./dish-form-sheet";
import { DishThumb } from "./dish-thumb";
import { Switch } from "./switch";

export function MenuManager() {
  const { state, dispatch } = useDemo();
  const { categories } = state;
  const [formTarget, setFormTarget] = useState<DishFormTarget>(null);
  const [newName, setNewName] = useState("");
  const [newError, setNewError] = useState<string | null>(null);

  const addCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateCategoryName(newName, categories);
    setNewError(error);
    if (error) return;
    dispatch({ type: "addCategory", name: newName }, `Categoría “${newName.trim()}” creada`);
    setNewName("");
  };

  return (
    <>
      <form onSubmit={addCategory} noValidate className="mb-6 rounded-xl border border-line p-4">
        <label htmlFor="new-category" className="mb-2 block type-label">
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
            className={inputClass}
          />
          <Button type="submit" size="lg" className="shrink-0">
            Crear
          </Button>
        </div>
        <FieldError id="new-category-error">{newError ?? undefined}</FieldError>
      </form>

      {categories.length === 0 ? (
        <div className="rounded-xl border border-line px-6 py-10 text-center">
          <p className="text-[17px] font-semibold">Tu carta está vacía</p>
          <p className="mt-1 text-[15px] text-muted">Creá una categoría para empezar a cargar platos.</p>
        </div>
      ) : (
        <ol className="space-y-6">
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
          dispatch({ type: "saveDish", categoryId, previousCategoryId, dish }, dish.id ? `“${dish.name}” actualizado` : `“${dish.name}” agregado`);
          setFormTarget(null);
        }}
        onDelete={(categoryId, dishId) => {
          dispatch({ type: "deleteDish", categoryId, dishId }, "Plato eliminado", "neutral");
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
  const { dispatch } = useDemo();
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
    dispatch({ type: "renameCategory", categoryId: cat.id, name }, `Categoría renombrada a “${name.trim()}”`);
    setRenaming(false);
  };

  const move = (direction: -1 | 1) => {
    dispatch({ type: "moveCategory", categoryId: cat.id, direction }, `“${cat.name}” movida a la posición ${index + 1 + direction}`, "neutral");
  };

  return (
    <li className="rounded-xl border border-line" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-2">
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
              className={cn(inputClass, "h-10 min-w-0 flex-1")}
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
            <h2 id={headingId} className="min-w-0 flex-1 type-section [overflow-wrap:anywhere]">
              {cat.name}
            </h2>
            <span className="type-help">
              {active}/{cat.dishes.length} visibles
            </span>
          </>
        )}
      </div>

      {!renaming && (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-3">
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
            <span className="flex items-center gap-2 rounded-lg border border-danger/40 py-1 pr-1 pl-3 text-[14px] text-danger">
              {cat.dishes.length ? `Borra ${cat.dishes.length} platos.` : "¿Eliminar?"}
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  dispatch({ type: "deleteCategory", categoryId: cat.id }, `Categoría “${cat.name}” eliminada`, "neutral");
                }}
              >
                Eliminar
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setConfirmDelete(false)}>
                No
              </Button>
            </span>
          ) : (
            <IconButton label={`Eliminar ${cat.name}`} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
            </IconButton>
          )}
          <Button size="sm" variant="secondary" onClick={onAddDish} className="ml-auto">
            <Plus className="size-4" aria-hidden /> Plato<span className="sr-only"> en {cat.name}</span>
          </Button>
        </div>
      )}

      {cat.dishes.length === 0 ? (
        <p className="mx-4 mb-4 rounded-lg bg-subtle px-4 py-5 text-center type-help">
          Sin platos todavía. Esta categoría no se muestra en el menú público.
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {cat.dishes.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              {/* Sin opacidad sobre el texto: un plato no disponible se marca con etiqueta (contraste AA). */}
              <span className={cn("relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-subtle text-muted", !d.active && "opacity-50 grayscale")}>
                <DishThumb image={d.image} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[15px] leading-snug font-medium [overflow-wrap:anywhere]">{d.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 type-help tabular-nums">
                  {formatPrice(d.price)}
                  {!d.active && (
                    <span className="rounded-md border border-line-strong px-1.5 py-0.5 text-[13px] whitespace-nowrap text-foreground">No disponible</span>
                  )}
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
    </li>
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
        "pressable grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-foreground disabled:opacity-30",
        className,
      )}
      {...props}
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}
