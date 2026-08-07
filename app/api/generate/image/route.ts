import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import { getImageProvider } from "@/lib/image/factory";
import {
  GENERATION_SIZE,
  RateLimitError,
  sniffImageType,
  type ReferenceImage,
} from "@/lib/image/provider";
import { composeImagePrompt, IMAGE_PROMPT_VERSION } from "@/prompts/image-prompt";
import { artDirectionSchema } from "@/lib/schemas/brand";
import { logGeneration } from "@/lib/ai/log-generation";
import { estimateImageCostUsd } from "@/lib/ai/pricing";
import { codeOf } from "@/lib/errors";
import { templateUsesProduct } from "@/templates/registry";
import { FORMAT_KEYS, type FormatKey } from "@/templates/types";

/*
  FLUX.2 runs roughly 8-25s. 120s leaves room for a slow queue without letting a
  wedged request sit forever; every plan allows at least 300s.

  Note what does NOT cross this function: the image bytes. fal's CDN to Supabase
  Storage is a server-to-server copy, and the client only ever receives a signed
  URL. Proxying a 2 MP PNG through here would run straight into Vercel's 4.5 MB
  response cap.
*/
export const maxDuration = 120;

const BUCKET = "generated";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const requestSchema = z.object({
  brandId: z.uuid(),
  brief: z.string().trim().min(4).max(2000),
  format: z.enum(FORMAT_KEYS as [FormatKey, ...FormatKey[]]),
  templateSlug: z.string().trim().min(1).max(80),
  /** Reuse to hold style steady across a carousel; omit for a fresh look. */
  seed: z.number().int().nullable().optional(),
  /**
   * The product this slide composites, when it has one.
   *
   * Used as a SCENE REFERENCE — its photo is sent to the model so the empty set
   * is lit and framed for that object. The product is still composited by the
   * template from these same bytes; the model never draws it.
   */
  productId: z.uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Solicitud inválida." },
      { status: 400 },
    );
  }

  const { brandId, brief, format, templateSlug, seed, productId } = parsed.data;

  let workspaceId: string;
  try {
    workspaceId = await requireWorkspaceId();
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "No autorizado." },
      { status: 401 },
    );
  }

  const supabase = await createClient();

  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("id, name, art_direction")
    .eq("id", brandId)
    .maybeSingle();

  if (brandError) {
    return NextResponse.json({ error: brandError.message }, { status: 500 });
  }
  if (!brand) {
    return NextResponse.json({ error: "No se encontró la marca." }, { status: 404 });
  }

  const artDirection = artDirectionSchema.safeParse(brand.art_direction);
  /*
    Derived from the template rather than accepted as a request field.

    A product template ALWAYS composites a product, so the two can never
    disagree — and a caller that forgot to send the flag would get a scene with
    something already standing in the spot the product is about to occupy.
  */
  const hasProduct = templateUsesProduct(templateSlug);
  const size = GENERATION_SIZE[format];
  const provider = getImageProvider();

  /*
    The scene reference, fetched server-to-server.

    Only when all three things line up: the template composites a product, a
    product was named, and the configured provider can actually take a reference.
    Any of them missing means the scene is generated without a cue — which is
    the ordinary case, not a failure.

    Every step degrades rather than throws. A product row that vanished, a
    Storage object that 404s, bytes that are not an image: none of those are a
    reason to lose a generation the user is waiting for, and the reason is
    recorded on the row instead.
  */
  let referenceImage: ReferenceImage | null = null;
  let referenceNote: string | null = null;

  if (hasProduct && productId) {
    if (!provider.supportsReferenceImage) {
      referenceNote = `${provider.name} no acepta imagen de referencia`;
    } else {
      // Scoped to the brand as well as the workspace, exactly as the batch
      // route does: RLS bounds this to the workspace, and slides carry no
      // brand_id, so nothing else stops one client's product being used as the
      // reference for another client's scene.
      const { data: product } = await supabase
        .from("brand_products")
        .select("image_path")
        .eq("id", productId)
        .eq("brand_id", brand.id)
        .maybeSingle();

      if (!product) {
        referenceNote = "el producto no pertenece a esta marca";
      } else {
        const { data: file, error: downloadError } = await supabase.storage
          .from("brand-assets")
          .download(product.image_path);

        if (downloadError || !file) {
          referenceNote = `no se pudo leer la foto del producto: ${downloadError?.message ?? "sin datos"}`;
        } else {
          const bytes = new Uint8Array(await file.arrayBuffer());
          // Sniffed, never trusted from Storage: the contentType trap in §7 of
          // HANDOFF is exactly about that field being wrong.
          const sniffed = sniffImageType(bytes);
          if (!sniffed) {
            referenceNote = "la foto del producto no es una imagen reconocible";
          } else {
            referenceImage = { bytes, contentType: sniffed };
          }
        }
      }
    }
  }

  const prompt = composeImagePrompt({
    brief,
    artDirection: artDirection.success
      ? artDirection.data
      : { photographic_style: "", lighting: "", palette_notes: "", avoid: [] },
    format,
    templateSlug,
    hasProduct,
    // Only claimed when the bytes are genuinely going along. Telling the model
    // about "the attached image" with nothing attached is an instruction it
    // cannot follow.
    hasReferenceImage: referenceImage !== null,
  });

  const started = Date.now();

  try {
    const image = await provider.generate({
      prompt,
      width: size.width,
      height: size.height,
      aspectRatio: size.aspectRatio,
      seed: seed ?? null,
      referenceImage,
    });

    // The provider already normalised its result to bytes, so this is a plain
    // server-to-server write into Storage — the 4.5 MB body cap never applies,
    // and the client only ever receives a signed URL.
    const extension = image.contentType === "image/jpeg" ? "jpg" : "png";
    const path = `${workspaceId}/${brand.id}/backgrounds/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, image.bytes, {
        contentType: image.contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`No se pudo guardar la imagen: ${uploadError.message}`);
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signedError || !signed) {
      throw new Error(
        `No se pudo firmar la URL: ${signedError?.message ?? "desconocido"}`,
      );
    }

    const costUsd = estimateImageCostUsd(image.model, image.megapixels);
    const durationMs = Date.now() - started;

    await logGeneration({
      workspaceId,
      brandId: brand.id,
      kind: "image",
      provider: image.provider,
      model: image.model,
      input: {
        brief,
        format,
        templateSlug,
        prompt,
        promptVersion: IMAGE_PROMPT_VERSION,
        hasProduct,
        productId: productId ?? null,
        /*
          Both recorded, and they are different facts. `referenceSent` is what
          this route decided; `referenceUsed` (in output, below) is what the
          provider actually did with it. A scene whose light does not match its
          product can then be traced to which of the two failed, instead of
          being a shrug.
        */
        referenceSent: referenceImage !== null,
        referenceNote,
        width: size.width,
        height: size.height,
        seed: seed ?? null,
      },
      output: {
        path,
        seed: image.seed,
        width: image.width,
        height: image.height,
        megapixels: image.megapixels,
        referenceUsed: image.referenceUsed,
      },
      inputTokens: image.inputTokens,
      outputTokens: image.outputTokens,
      costUsd,
      durationMs,
      ok: true,
    });

    return NextResponse.json({
      path,
      signedUrl: signed.signedUrl,
      seed: image.seed,
      width: image.width,
      height: image.height,
      megapixels: image.megapixels,
      prompt,
      costUsd,
      durationMs,
      // Surfaced so the panel can say "escena ajustada al producto" only when
      // it actually was, rather than promising a refinement that did not happen.
      referenceUsed: image.referenceUsed,
      referenceNote,
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Falló la generación de imagen.";
    const rateLimited = cause instanceof RateLimitError;

    await logGeneration({
      workspaceId,
      brandId: brand.id,
      kind: "image",
      provider: provider.name,
      model: provider.model,
      input: { brief, format, templateSlug, prompt, promptVersion: IMAGE_PROMPT_VERSION },
      output: rateLimited ? { rateLimited: true } : {},
      durationMs: Date.now() - started,
      ok: false,
      error: message,
    });

    /*
      A rate limit answers 429, not 500, and says how long to wait.

      This is what lets the queue pace itself against whatever tier is actually
      configured rather than against a constant compiled into the browser: it
      runs flat out and slows down only when told to, so the free tier's ~2
      images/minute and a paid tier's much higher ceiling both work with no
      configuration. Retry-After is set as well so anything that speaks plain
      HTTP behaves sensibly too.
    */
    if (rateLimited) {
      const retryAfterMs = (cause as RateLimitError).retryAfterMs;
      return NextResponse.json(
        { error: message, code: "rate_limit", rateLimited: true, retryAfterMs },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
        },
      );
    }

    return NextResponse.json(
      { error: message, code: codeOf(cause) },
      { status: 500 },
    );
  }
}
