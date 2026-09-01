"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { brandFormSchema, type BrandFormValues } from "@/lib/schemas/brand";
import { createBrand, updateBrand } from "@/app/(app)/marcas/actions";
import { PaletteEditor } from "@/components/brands/palette-editor";
import { TypographyPicker } from "@/components/brands/typography-picker";
import { LogoUpload } from "@/components/brands/logo-upload";
import { StringListInput } from "@/components/brands/string-list-input";
import { ImportFromSite } from "@/components/brands/import-from-site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTip } from "@/components/ui/help-tip";
import { SuggestInput, SuggestTextarea } from "@/components/ui/suggest-field";

/** Which <Section id> owns each top-level (or dotted) schema field, in the
 * form's own visual order — so an invalid submit can jump to the right one. */
const SECTION_BY_FIELD = {
  name: "section-identidad",
  tagline: "section-identidad",
  logo_path: "section-identidad",
  palette: "section-paleta",
  typography: "section-tipografia",
  tone_of_voice: "section-voz",
  target_audience: "section-voz",
  example_captions: "section-voz",
  art_direction: "section-direccion-arte",
} as const;

/** Fields registered as a plain <Input>/<Textarea> whose id equals the field
 * name, so they can be focused directly rather than just scrolled to. */
const FOCUSABLE_FIELDS = new Set([
  "name",
  "tagline",
  "tone_of_voice",
  "target_audience",
]);

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="grid gap-6 border-b border-border py-8 md:grid-cols-[240px_1fr] scroll-mt-6"
    >
      {/*
        The label follows its own section down.

        `self-start` is what makes `sticky` possible at all: a grid item
        stretches to the row height by default, and an element with no room to
        move inside its track never sticks. With it, "Dirección de arte" stays
        beside the field being edited instead of scrolling off at the top of a
        section that is six fields long.
      */}
      <div className="space-y-1 md:sticky md:top-6 md:self-start">
        <h2 className="eyebrow">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

export function BrandForm({
  mode,
  brandId,
  initialValues,
}: {
  mode: "create" | "edit";
  brandId?: string;
  initialValues: BrandFormValues;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    getValues,
    reset,
    formState: { errors },
  } = useForm<BrandFormValues>({
    resolver: zodResolver(brandFormSchema),
    defaultValues: initialValues,
  });

  /*
    Merged over whatever is on screen, not substituted for it.

    Someone who typed a name and then pasted a URL should keep their name.
    `reset` rather than a stream of `setValue` calls because the palette is a
    field array — setting it field by field leaves the array's internal keys
    stale and the editor renders the old rows.
  */
  function applyDraft(draft: Partial<BrandFormValues>) {
    reset({ ...getValues(), ...draft }, { keepDefaultValues: true });
  }

  /*
    Before this, an invalid submit did nothing visible. `handleSubmit` never
    calls `onSubmit` on a failing schema, and nothing scrolled or focused the
    field that failed — so a Paleta error while editing Dirección de arte, five
    sections down, looked exactly like the button just not working.
  */
  function onInvalid(formErrors: FieldErrors<BrandFormValues>) {
    toast.error("Hay campos para corregir antes de guardar.");

    const firstKey = (
      Object.keys(SECTION_BY_FIELD) as Array<keyof typeof SECTION_BY_FIELD>
    ).find((key) => formErrors[key]);
    if (!firstKey) return;

    document
      .getElementById(SECTION_BY_FIELD[firstKey])
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

    // Only the plain registered fields have an <input>/<textarea> whose id
    // matches the field name directly; Controller-driven fields (palette,
    // typography, the string lists) render their own sub-inputs, so getting
    // to the SECTION is the honest amount of help for those.
    if (FOCUSABLE_FIELDS.has(firstKey)) {
      requestAnimationFrame(() => {
        document.getElementById(firstKey)?.focus({ preventScroll: true });
      });
    }
  }

  async function onSubmit(values: BrandFormValues) {
    setPending(true);
    try {
      const result =
        mode === "create"
          ? await createBrand(values)
          : await updateBrand(brandId!, values);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      // Fonts are synced server-side on save. A failure there is not fatal to
      // the brand, but it WILL surface as a wrong typeface at export time, so
      // it gets its own visible warning rather than a silent pass.
      if (result.warning) {
        toast.warning(`Marca guardada, pero: ${result.warning}`);
      } else {
        toast.success(mode === "create" ? "Marca creada." : "Cambios guardados.");
      }

      router.push("/marcas");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit, onInvalid)}
      className="px-6 pb-16 md:px-8"
    >
      {/* Only when creating: re-reading a site over an established kit would
          overwrite decisions someone already made. */}
      {mode === "create" ? (
        <div className="pt-8">
          <ImportFromSite onDraft={applyDraft} />
        </div>
      ) : null}

      <Section
        id="section-identidad"
        title="Identidad"
        description="Cómo se llama la marca y su logo."
      >
        {/*
          The name deliberately does NOT offer its placeholder. "Synera" is this
          agency's own name, and a Tab that fills a client's brand with it is a
          mistake someone would ship. Every other placeholder on this form is an
          example of the KIND of answer wanted, which is a different thing.
        */}
        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" {...register("name")} placeholder="Synera" />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tagline">Tagline</Label>
          <SuggestInput
            id="tagline"
            {...register("tagline")}
            placeholder="Automatización para pymes"
          />
          <FieldError message={errors.tagline?.message} />
        </div>

        <div className="space-y-2">
          <Label>Logo</Label>
          <Controller
            control={control}
            name="logo_path"
            render={({ field }) => (
              <LogoUpload value={field.value} onChange={field.onChange} />
            )}
          />
        </div>
      </Section>

      <Section
        id="section-paleta"
        title="Paleta"
        description="Los tokens que las plantillas consumen como variables CSS. Nunca se hardcodean colores."
      >
        <Controller
          control={control}
          name="palette"
          render={({ field }) => (
            <PaletteEditor
              value={field.value}
              onChange={field.onChange}
              error={errors.palette?.message ?? errors.palette?.root?.message}
            />
          )}
        />
      </Section>

      <Section
        id="section-tipografia"
        title="Tipografía"
        description="Se aloja en tu Storage para que el export sea idéntico al preview."
      >
        <Controller
          control={control}
          name="typography"
          render={({ field }) => (
            <TypographyPicker value={field.value} onChange={field.onChange} />
          )}
        />
      </Section>

      <Section
        id="section-voz"
        title="Voz"
        description="Lo que Claude usa para escribir el guion, el copy sobre la imagen y el caption."
      >
        <div className="space-y-2">
          <Label htmlFor="tone_of_voice" className="flex items-center gap-1.5">
            Tono de voz
            <HelpTip>
              Cómo habla la marca, no de qué habla. Ej.: “Directo y sin vueltas,
              voseo rioplatense, admite cuando algo no se puede. Nunca usa
              signos de exclamación ni promesas de resultados”.
            </HelpTip>
          </Label>
          <SuggestTextarea
            id="tone_of_voice"
            rows={4}
            {...register("tone_of_voice")}
            placeholder="Cercano pero profesional. Voseo rioplatense. Sin jerga corporativa ni promesas exageradas."
          />
          <FieldError message={errors.tone_of_voice?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="target_audience">Audiencia</Label>
          <SuggestTextarea
            id="target_audience"
            rows={3}
            {...register("target_audience")}
            placeholder="Dueños de pymes argentinas de 5 a 50 empleados, poco técnicos, sin tiempo."
          />
          <FieldError message={errors.target_audience?.message} />
        </div>

        <div className="space-y-2">
          <Label>Captions de ejemplo</Label>
          <p className="text-xs text-muted-foreground">
            Dos o tres captions reales que suenen a la marca. Es la señal más
            fuerte de estilo que se le puede dar al modelo.
          </p>
          <Controller
            control={control}
            name="example_captions"
            render={({ field }) => (
              <StringListInput
                value={field.value}
                onChange={field.onChange}
                addLabel="Agregar caption"
                placeholder="Pegá acá un caption que ya hayas publicado…"
                multiline
              />
            )}
          />
        </div>
      </Section>

      <Section
        id="section-direccion-arte"
        title="Dirección de arte"
        description="Alimenta el prompt de imagen. El modelo genera solo fondos: el texto lo pone el código."
      >
        <div className="space-y-2">
          <Label htmlFor="photographic_style" className="flex items-center gap-1.5">
            Estilo fotográfico
            <HelpTip>
              La estética de los fondos, en términos de fotografía real. Ej.:
              “Fotografía natural con luz cálida, paleta terrosa, grano suave,
              sin renders 3D ni ilustración”.
            </HelpTip>
          </Label>
          <SuggestTextarea
            id="photographic_style"
            rows={3}
            {...register("art_direction.photographic_style")}
            placeholder="Fotografía editorial, planos cerrados, profundidad de campo corta, textura real de oficina."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lighting" className="flex items-center gap-1.5">
            Iluminación
            <HelpTip>
              Define el clima de la imagen más que ninguna otra cosa. Ej.: “Luz
              natural lateral de mañana, sombras largas y suaves”.
            </HelpTip>
          </Label>
          <SuggestInput
            id="lighting"
            {...register("art_direction.lighting")}
            placeholder="Luz natural lateral, sombras suaves, hora dorada"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="palette_notes">Notas de color</Label>
          <SuggestInput
            id="palette_notes"
            {...register("art_direction.palette_notes")}
            placeholder="Tonos fríos, acentos cian, evitar saturación alta"
          />
        </div>

        {/*
          Collapsed until there is something in it. A brand-new kit has
          nothing to avoid yet, and the field is optional by schema — showing
          its full chrome anyway is exactly the "wall of form" this was meant
          to cut down on. It opens on its own the moment a restriction exists.
        */}
        <Controller
          control={control}
          name="art_direction.avoid"
          render={({ field }) => (
            <details className="group" open={field.value.length > 0}>
              <summary className="flex cursor-pointer list-none items-center gap-1.5 marker:content-none">
                <span className="text-sm font-medium">Evitar</span>
                <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Se suma al prompt negativo. Las directivas de &ldquo;sin
                  texto, sin letras, sin logos&rdquo; ya van siempre, no hace
                  falta repetirlas.
                </p>
                <StringListInput
                  value={field.value}
                  onChange={field.onChange}
                  addLabel="Agregar restricción"
                  placeholder="stock photo genérico"
                  max={30}
                  suggest
                />
              </div>
            </details>
          )}
        />
      </Section>

      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-background/80 py-4 backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/marcas")}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Guardando…"
            : mode === "create"
              ? "Crear marca"
              : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
