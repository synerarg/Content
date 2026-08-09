import { uploadViaSignedUrl } from "@/lib/storage";
import { setSlideRender } from "@/app/(app)/contenido/actions";
import { readPngDimensions } from "./rasterize";
import { renderFingerprint, type FingerprintInput } from "./render-fingerprint";

/*
  Getting a finished placa out of the browser.

  Everything the app renders has, until now, existed only for as long as the tab
  did — the editor rasterizes client-side, the ZIP is assembled client-side, and
  the bytes go to the user's disk. Nothing server-side has ever held the composed
  image.

  Three consumers need it to: Instagram's publishing API, which takes a URL and
  fetches it rather than accepting bytes; anything that shows a client their
  piece without handing them a ZIP; and any future job that runs when nobody has
  the page open.

  ORDER MATTERS HERE. The bytes are verified, then uploaded, then recorded. A
  row pointing at an object that does not exist is worse than an object nothing
  points at: the first is a broken promise the publish path will trip over at
  the worst moment, the second is a few hundred kilobytes nobody reads.
*/

export type PersistRenderResult = {
  path: string;
  fingerprint: string;
  bytes: number;
};

export async function persistSlideRender({
  slideId,
  brandId,
  blob,
  expected,
  fingerprintInput,
}: {
  slideId: string;
  brandId: string;
  /** The already-rasterized PNG. This function never renders — it only stores. */
  blob: Blob;
  expected: { width: number; height: number };
  fingerprintInput: FingerprintInput;
}): Promise<PersistRenderResult> {
  /*
    Checked before it is stored, not after.

    The export path already verifies dimensions before putting a PNG in the ZIP,
    and a stored render has a stricter claim to live up to: something will fetch
    it later, unattended, and publish it. A slide that came out at the wrong
    size has to fail here — while a person is watching — rather than become a
    file that looks fine until it is on a feed at the wrong aspect ratio.
  */
  const dims = await readPngDimensions(blob);
  if (dims.width !== expected.width || dims.height !== expected.height) {
    throw new Error(
      `La placa salió en ${dims.width}x${dims.height} en lugar de ${expected.width}x${expected.height}. No se guardó.`,
    );
  }

  const file = new File([blob], `${slideId}.png`, { type: "image/png" });

  const path = await uploadViaSignedUrl(file, {
    kind: "render",
    filename: file.name,
    brandId,
    slideId,
  });

  const fingerprint = renderFingerprint(fingerprintInput);

  const result = await setSlideRender(slideId, { path, fingerprint });
  if (!result.ok) {
    /*
      The object is uploaded and the row is not. Deliberately left there rather
      than deleted: the upload is the expensive half, the orphan is harmless,
      and a delete on this path would need its own error handling for the case
      where IT fails too. Retrying the whole action simply writes a new object
      and records that one.
    */
    throw new Error(result.error);
  }

  return { path, fingerprint, bytes: blob.size };
}
