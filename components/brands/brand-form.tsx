"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { brandFormSchema, type BrandFormValues } from "@/lib/schemas/brand";
import { createBrand, updateBrand } from "@/app/(app)/marcas/actions";
import { PaletteEditor } from "@/components/brands/palette-editor";
import { TypographyPicker } from "@/components/brands/typography-picker";
import { LogoUpload } from "@/components/brands/logo-upload";
import { StringListInput } from "@/components/brands/string-list-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 border-b border-border py-8 md:grid-cols-[240px_1fr]">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
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
    formState: { errors },
  } = useForm<BrandFormValues>({
    resolver: zodResolver(brandFormSchema),
    defaultValues: initialValues,
  });

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
    <form onSubmit={handleSubmit(onSubmit)} className="px-6 pb-16 md:px-8">
      <Section
        title="Identidad"
        description="Cómo se llama la marca y su logo."
      >
        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" {...register("name")} placeholder="Synera" />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tagline">Tagline</Label>
          <Input
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
        title="Voz"
        description="Lo que Claude usa para escribir el guion, el copy sobre la imagen y el caption."
      >
        <div className="space-y-2">
          <Label htmlFor="tone_of_voice">Tono de voz</Label>
          <Textarea
            id="tone_of_voice"
            rows={4}
            {...register("tone_of_voice")}
            placeholder="Cercano pero profesional. Voseo rioplatense. Sin jerga corporativa ni promesas exageradas."
          />
          <FieldError message={errors.tone_of_voice?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="target_audience">Audiencia</Label>
          <Textarea
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
        title="Dirección de arte"
        description="Alimenta el prompt de imagen. El modelo genera solo fondos: el texto lo pone el código."
      >
        <div className="space-y-2">
          <Label htmlFor="photographic_style">Estilo fotográfico</Label>
          <Textarea
            id="photographic_style"
            rows={3}
            {...register("art_direction.photographic_style")}
            placeholder="Fotografía editorial, planos cerrados, profundidad de campo corta, textura real de oficina."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lighting">Iluminación</Label>
          <Input
            id="lighting"
            {...register("art_direction.lighting")}
            placeholder="Luz natural lateral, sombras suaves, hora dorada"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="palette_notes">Notas de color</Label>
          <Input
            id="palette_notes"
            {...register("art_direction.palette_notes")}
            placeholder="Tonos fríos, acentos cian, evitar saturación alta"
          />
        </div>

        <div className="space-y-2">
          <Label>Evitar</Label>
          <p className="text-xs text-muted-foreground">
            Se suma al prompt negativo. Las directivas de &ldquo;sin texto, sin
            letras, sin logos&rdquo; ya van siempre, no hace falta repetirlas.
          </p>
          <Controller
            control={control}
            name="art_direction.avoid"
            render={({ field }) => (
              <StringListInput
                value={field.value}
                onChange={field.onChange}
                addLabel="Agregar restricción"
                placeholder="stock photo genérico"
                max={30}
              />
            )}
          />
        </div>
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
