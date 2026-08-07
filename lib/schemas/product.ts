import { z } from "zod";

/*
  One schema, two consumers — the panel validates in the browser, the server
  action re-validates before touching the database. Same split as the Brand Kit:
  the client copy is a convenience, the server copy is the guarantee.

  No `.default()` and no `z.coerce`, for the reason spelled out in
  lib/schemas/brand.ts: either one makes the zod input type diverge from the
  output type, and every consumer then needs a cast to compile.
*/

export const productFormSchema = z.object({
  name: z.string().trim().min(1, "El producto necesita un nombre.").max(120),
  /**
   * What the product IS, in words.
   *
   * Read by the copy generator, not by the renderer. Without it a piece about
   * the product can only describe the photograph; with it the copy can say
   * something true — what it does, who it is for, what makes it different.
   */
  description: z.string().trim().max(2000),
  image_path: z.string().trim().min(1, "Subí una foto del producto.").max(500),
  /**
   * Measured in the browser at upload time, never inferred from the extension.
   * Decides which templates accept this product — see migration 0013.
   */
  has_transparency: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

/** A product as every consumer downstream of the database sees it. */
export type BrandProduct = {
  id: string;
  name: string;
  description: string;
  imagePath: string;
  hasTransparency: boolean;
};

export function productRowToProduct(row: {
  id: string;
  name: string;
  description: string | null;
  image_path: string;
  has_transparency: boolean;
}): BrandProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    imagePath: row.image_path,
    hasTransparency: row.has_transparency,
  };
}
