"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Pencil, Plus, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createCategory, deleteCategory, updateCategory } from "@/app/actions";
import { CATEGORY_ICON_NAMES, CategoryGlyph, CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input, Label, NativeSelect } from "@/components/ui/field";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import type { CategoryUsage } from "@/server/queries/categories";

type Kind = CategoryUsage["kind"];

const KINDS: Kind[] = ["expense", "income", "transfer"];

/**
 * A category as listed: `name` is the one shown — for a built-in category
 * that is its name in the interface language — and `storedName` the one in
 * the database.
 */
export type ListedCategory = CategoryUsage & { storedName: string };

interface Draft {
  id: number | null;
  name: string;
  kind: Kind;
  icon: string;
}

export function CategoryManager({ categories }: { categories: ListedCategory[] }) {
  const { t, link } = useI18n();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const editing = draft && draft.id !== null ? categories.find((category) => category.id === draft.id) : null;

  function edit(next: Draft) {
    setDraft(next);
    setOpen(true);
  }

  function save() {
    if (!draft) return;
    // A built-in category left under its translated name keeps the name it is
    // stored with, so it goes on following the interface language.
    const name = editing && draft.name.trim() === editing.name ? editing.storedName : draft.name;
    const input = { name, kind: draft.kind, icon: draft.icon };
    startTransition(async () => {
      const result = draft.id === null ? await createCategory(input) : await updateCategory(draft.id, input);
      if (!result.ok) {
        toast.error(t.error(result.error));
        return;
      }
      toast.success(draft.id === null ? t("categories.added") : t("categories.saved"));
      setOpen(false);
    });
  }

  function remove() {
    if (!draft || draft.id === null) return;
    const id = draft.id;
    startTransition(async () => {
      const result = await deleteCategory(id);
      if (!result.ok) {
        toast.error(t.error(result.error));
        return;
      }
      toast.success(t("categories.deleted"));
      setOpen(false);
    });
  }

  return (
    <>
      <div className="grid gap-x-8 gap-y-6 px-5 pb-5 md:grid-cols-3">
        {KINDS.map((kind) => (
          <section key={kind}>
            <h3 className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t(`flow.${kind}`)}</h3>
            <p className="mt-1 mb-2 text-xs text-ink-3">{t(`categories.hint.${kind}`)}</p>
            <ul className="-mx-2">
              {categories
                .filter((category) => category.kind === kind)
                .map((category) => (
                  <li key={category.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-wash/60">
                    <CategoryIcon name={category.icon} size="sm" />
                    <Link
                      href={link("/transactions", { category: category.id })}
                      className="min-w-0 flex-1 truncate text-sm text-ink hover:underline"
                    >
                      {category.name}
                    </Link>
                    <span className="text-[13px] text-ink-3 tabular">{category.transactionCount}</span>
                    <button
                      type="button"
                      onClick={() => edit({ id: category.id, name: category.name, kind: category.kind, icon: category.icon })}
                      aria-label={t("categories.editNamed", { name: category.name })}
                      className="grid size-7 place-items-center rounded-md text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-wash-strong hover:text-ink focus-visible:opacity-100"
                    >
                      <Pencil aria-hidden className="size-3.5" />
                    </button>
                  </li>
                ))}
            </ul>
            <Button
              size="sm"
              variant="ghost"
              className="mt-1 -ml-1"
              onClick={() => edit({ id: null, name: "", kind, icon: "Tag" })}
            >
              <Plus aria-hidden className="size-4" />
              {t("common.add")}
            </Button>
          </section>
        ))}
      </div>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/25 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-black/50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface shadow-popover outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            {draft ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  save();
                }}
              >
                <header className="flex items-center justify-between gap-4 px-5 pt-4 pb-1">
                  <Dialog.Title className="text-base font-semibold text-ink">
                    {draft.id === null ? t("categories.new") : t("categories.edit")}
                  </Dialog.Title>
                  <Dialog.Close
                    aria-label={t("common.close")}
                    className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-wash hover:text-ink"
                  >
                    <X aria-hidden className="size-4" />
                  </Dialog.Close>
                </header>

                <div className="space-y-4 px-5 py-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_9.5rem] gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="category-name">{t("categories.name")}</Label>
                      <Input
                        id="category-name"
                        autoFocus
                        required
                        maxLength={40}
                        value={draft.name}
                        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="category-kind">{t("categories.countsAs")}</Label>
                      <NativeSelect
                        id="category-kind"
                        value={draft.kind}
                        onChange={(event) => setDraft({ ...draft, kind: event.target.value as Kind })}
                        className="w-full"
                      >
                        {KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {t(`countsAs.${kind}`)}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </div>

                  <fieldset>
                    <legend className="mb-1.5 text-[13px] font-medium text-ink-2">{t("categories.icon")}</legend>
                    <div className="grid max-h-40 grid-cols-10 gap-1 overflow-y-auto rounded-lg border border-line p-1.5">
                      {CATEGORY_ICON_NAMES.map((name) => (
                        <label
                          key={name}
                          title={name}
                          className={cn(
                            "grid aspect-square cursor-pointer place-items-center rounded-md text-ink-2 transition-colors hover:bg-wash has-focus-visible:outline-2 has-focus-visible:outline-accent",
                            draft.icon === name && "bg-ink text-surface hover:bg-ink",
                          )}
                        >
                          <input
                            type="radio"
                            name="icon"
                            value={name}
                            checked={draft.icon === name}
                            onChange={() => setDraft({ ...draft, icon: name })}
                            className="sr-only"
                          />
                          <CategoryGlyph name={name} />
                          <span className="sr-only">{name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {editing && editing.transactionCount > 0 ? (
                    <p className="text-xs text-ink-3">
                      {t("categories.deleteNote", {
                        count: editing.transactionCount,
                        rules: editing.ruleCount > 0 ? t("categories.deleteRules", { count: editing.ruleCount }) : "",
                      })}
                    </p>
                  ) : null}
                </div>

                <footer className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
                  {draft.id !== null ? (
                    <ConfirmButton
                      variant="ghost"
                      size="sm"
                      confirmLabel={t("categories.confirmDelete")}
                      disabled={pending}
                      onConfirm={remove}
                    >
                      {t("common.delete")}
                    </ConfirmButton>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <Dialog.Close className="h-9 rounded-lg px-3.5 text-sm text-ink-2 hover:bg-wash hover:text-ink">
                      {t("common.cancel")}
                    </Dialog.Close>
                    <Button type="submit" variant="primary" disabled={pending || draft.name.trim() === ""}>
                      {t("common.save")}
                    </Button>
                  </div>
                </footer>
              </form>
            ) : null}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
