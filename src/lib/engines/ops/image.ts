/**
 * Image engine.
 *
 * Everything in this file runs on the visitor's device. There is no fetch, no
 * XHR and no remote URL: images are decoded with the codecs the browser already
 * has, drawn into a canvas, and re-encoded into a Blob. That is the product
 * promise, so it is enforced by simply not having a network call in here.
 *
 * Failure model for batches: every file is attempted with bounded concurrency,
 * and a file that fails is *never* turned into a `FileOutput` with an empty
 * blob, because that would put a broken download in front of the user. Instead
 * the operation throws once the batch has finished, with a message that names
 * each failure in prose, and the `outputs` property carries the files that did
 * succeed so nothing that was computed is thrown away. If every file failed
 * there is nothing to attach and the error simply says why.
 */

import {
  fileExtension,
  formatBytes,
  safeDownloadName,
  stripExtension,
  withExtension,
} from "@/lib/format";
import type { ControlValues, FileOperation, FileOutput, ToolContext } from "../types";

/* --- format knowledge --------------------------------------------------- */

const EXTENSION_FOR_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
};

const FORMAT_LABEL: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/avif": "AVIF",
};

/**
 * What "same as the original" means per source format. BMP and ICO have no
 * encoder in any browser, so keeping the format would mean re-encoding them to
 * something else anyway; PNG is the one lossless raster format that is always
 * available, and a note says so rather than pretending nothing changed.
 */
const AUTO_FORMAT_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".jpe": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/png",
  ".ico": "image/png",
};

/**
 * Verified fallbacks, in order. `toBlob` does not fail when it cannot honour a
 * type — it quietly returns a PNG — so the bytes are sniffed and anything that
 * is not what was asked for is retried here rather than shipped mislabelled.
 */
const FALLBACK_CHAIN: Record<string, string[]> = {
  "image/avif": ["image/webp", "image/jpeg", "image/png"],
  "image/webp": ["image/jpeg", "image/png"],
  "image/jpeg": ["image/png"],
  "image/png": [],
};

const TRANSFORM_BY_VALUE: Record<string, Transform> = {
  "90": { rotation: 90, flipX: false, flipY: false },
  "180": { rotation: 180, flipX: false, flipY: false },
  "270": { rotation: 270, flipX: false, flipY: false },
  "flip-h": { rotation: 0, flipX: true, flipY: false },
  "flip-v": { rotation: 0, flipX: false, flipY: true },
};

const FLIP_BY_VALUE: Record<string, Transform> = {
  horizontal: { rotation: 0, flipX: true, flipY: false },
  vertical: { rotation: 0, flipX: false, flipY: true },
  both: { rotation: 0, flipX: true, flipY: true },
};

const IDENTITY: Transform = { rotation: 0, flipX: false, flipY: false };

/* --- small types -------------------------------------------------------- */

interface Transform {
  rotation: 0 | 90 | 180 | 270;
  flipX: boolean;
  flipY: boolean;
}

type Report = (fraction: number, note?: string) => void;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A decoded source image. `source` is either an `ImageBitmap` or an
 * `HTMLImageElement`, both of which are valid `drawImage` arguments, so the
 * rest of the pipeline does not care which decode path was used.
 */
type DecodedImage = {
  kind: "bitmap" | "element";
  source: CanvasImageSource;
  width: number;
  height: number;
};

interface RenderSpec {
  /** Region of the decoded image to copy, in its own pixels. */
  crop: Rect;
  /** Size of the result before any rotation is applied. */
  width: number;
  height: number;
  mime: string;
  quality: number;
  /** Painted underneath for formats with no alpha channel. */
  background: string;
  transform: Transform;
}

interface EncodedImage {
  blob: Blob;
  mime: string;
  /** The format that was actually written. */
  requested: string;
  width: number;
  height: number;
  /** True when the browser could not produce the requested format. */
  substituted: boolean;
}

/**
 * Only the canvas surface features this file actually uses. Both
 * `CanvasRenderingContext2D` and `OffscreenCanvasRenderingContext2D` satisfy it
 * structurally, which keeps the drawing code free of per-branch duplication.
 */
interface PaintContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;
  save(): void;
  restore(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

interface Surface {
  ctx: PaintContext;
  toBlob: (mime: string, quality: number) => Promise<Blob | null>;
}

/* --- control values ----------------------------------------------------- */

function numberValue(
  values: ControlValues,
  id: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = values[id];
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function stringValue(values: ControlValues, id: string, fallback: string): string {
  const raw = values[id];
  return typeof raw === "string" && raw.length > 0 ? raw : fallback;
}

function booleanValue(values: ControlValues, id: string, fallback: boolean): boolean {
  const raw = values[id];
  return typeof raw === "boolean" ? raw : fallback;
}

function qualityOf(values: ControlValues, fallback: number): number {
  return numberValue(values, "quality", fallback, 1, 100) / 100;
}

function mimeLabel(mime: string): string {
  return FORMAT_LABEL[mime] ?? "an image";
}

/* --- decoding ----------------------------------------------------------- */

function assertReencodable(file: File): void {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  // SVG is vector art. A canvas can only rasterise it at whatever resolution
  // the canvas happens to be, which silently destroys the thing that makes an
  // SVG worth using, so it is refused rather than returned as a blurry stand-in.
  if (name.endsWith(".svg") || type === "image/svg+xml") {
    throw new Error(
      "SVG is a vector format, and this tool works on raster pixels. Furtu will not rasterise your artwork here, because that would quietly change it. Open the file in a vector editor and export a PNG, then compress that.",
    );
  }

  // A canvas round-trip cannot carry animation: the decoder hands over the
  // first frame and the encoder writes a still image. Refusing is the honest
  // option, because a flattened GIF looks like it worked until it does not.
  if (name.endsWith(".gif") || type === "image/gif") {
    throw new Error(
      "GIF animation cannot be re-encoded through a browser canvas, and Furtu will not quietly hand you a still image that used to move. Export a single frame as PNG, or use a tool built for GIF encoding.",
    );
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "This browser could not decode the file. It may be damaged, or in a format the browser does not read — a photo straight from an iPhone is usually HEIC, which needs converting first.",
        ),
      );
    image.src = url;
  });
}

async function decodeImage(file: File): Promise<DecodedImage> {
  assertReencodable(file);

  if (typeof createImageBitmap === "function") {
    try {
      // `from-image` applies the EXIF orientation tag during decoding, so the
      // pixels are upright and no rotation has to be carried through the rest of
      // the pipeline. It is also markedly faster than the <img> path.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bitmap.width > 0 && bitmap.height > 0) {
        return { kind: "bitmap", source: bitmap, width: bitmap.width, height: bitmap.height };
      }
      bitmap.close();
    } catch {
      // Some browsers reject the options bag outright, and some refuse the
      // format. Both are better served by the <img> fallback than by a hard
      // stop, so the error is deliberately swallowed here.
    }
  }

  if (typeof document === "undefined") {
    throw new Error(
      "Image processing needs a browser. Furtu could not open a canvas in this environment.",
    );
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(url);
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      return {
        kind: "element",
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }
    throw new Error("That file decoded to an empty image, so there is nothing to work with.");
  } finally {
    // Revoked as soon as the pixels are in memory. An object URL that lives for
    // the lifetime of a single-page session is a real leak, not a pedantic one.
    URL.revokeObjectURL(url);
  }
}

function releaseDecoded(decoded: DecodedImage): void {
  if (decoded.kind === "bitmap" && typeof ImageBitmap !== "undefined") {
    // An ImageBitmap can hold a GPU-backed surface until it is closed. Closing
    // it on every path, including the error paths, is what stops a long session
    // of batch runs from climbing in memory.
    (decoded.source as ImageBitmap).close();
  }
  // The <img> path revoked its object URL as soon as decoding finished, so
  // there is nothing left to release there.
}

/* --- encoding ----------------------------------------------------------- */

function createSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      return {
        ctx,
        toBlob: async (mime, quality) => canvas.convertToBlob({ type: mime, quality }),
      };
    }
  }

  if (typeof document === "undefined") {
    throw new Error(
      "Image processing needs a browser. Furtu could not open a canvas in this environment.",
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error(
      "This browser could not open a 2D canvas, which Furtu needs in order to re-encode an image. That usually means canvas is blocked by a privacy setting or an extension.",
    );
  }
  return {
    ctx,
    toBlob: (mime, quality) =>
      new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), mime, quality);
      }),
  };
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/**
 * Reads the real format out of the encoded bytes. `toBlob` is not obliged to
 * honour the type it was given — asking for AVIF on a browser without an AVIF
 * encoder returns a PNG — and the browser is not to be trusted about it, so
 * every result is verified before it is handed back with an extension.
 */
async function sniffImageMime(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return "image/jpeg";
  if (head.length >= 8 && head[0] === 0x89 && ascii(head, 1, 4) === "PNG") return "image/png";
  if (head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP")
    return "image/webp";
  if (head.length >= 12 && ascii(head, 4, 8) === "ftyp" && /avif|avis/.test(ascii(head, 8, 32)))
    return "image/avif";
  return blob.type || "application/octet-stream";
}

async function encodeOnce(
  decoded: DecodedImage,
  spec: RenderSpec,
  mime: string,
): Promise<{ blob: Blob } | null> {
  const quarterTurn = spec.transform.rotation === 90 || spec.transform.rotation === 270;
  const width = quarterTurn ? spec.height : spec.width;
  const height = quarterTurn ? spec.width : spec.height;
  if (width < 1 || height < 1) return null;

  const surface = createSurface(width, height);
  const { ctx } = surface;

  // JPG is the only one of these four formats without an alpha channel, so it
  // is the only one that needs a background painted underneath. Without it a
  // transparent source comes out with black areas instead of white.
  if (mime === "image/jpeg") {
    ctx.fillStyle = spec.background;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const t = spec.transform;
  ctx.save();
  // Compose the transform around the centre: flip, then rotate, then place the
  // pre-transform rectangle so its middle sits on the output's middle. This
  // works for any combination of the two without a lookup table.
  ctx.translate(width / 2, height / 2);
  if (t.flipX || t.flipY) ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
  if (t.rotation !== 0) ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.translate(-spec.width / 2, -spec.height / 2);
  ctx.drawImage(
    decoded.source,
    spec.crop.x,
    spec.crop.y,
    spec.crop.width,
    spec.crop.height,
    0,
    0,
    spec.width,
    spec.height,
  );
  ctx.restore();

  const blob = await surface.toBlob(mime, spec.quality);
  if (!blob || blob.size === 0) return null;
  if ((await sniffImageMime(blob)) !== mime) return null;
  return { blob };
}

async function renderImage(decoded: DecodedImage, spec: RenderSpec): Promise<EncodedImage> {
  const candidates = [spec.mime, ...(FALLBACK_CHAIN[spec.mime] ?? [])];
  for (let index = 0; index < candidates.length; index += 1) {
    const mime = candidates[index];
    const encoded = await encodeOnce(decoded, spec, mime);
    if (!encoded) continue;
    const quarterTurn = spec.transform.rotation === 90 || spec.transform.rotation === 270;
    return {
      blob: encoded.blob,
      mime,
      requested: spec.mime,
      width: quarterTurn ? spec.height : spec.width,
      height: quarterTurn ? spec.width : spec.height,
      substituted: index > 0,
    };
  }
  throw new UnsupportedFormatError(
    `This browser cannot encode ${mimeLabel(spec.mime)} images. Furtu will not hand you a file that is not the format it says it is. Chrome, Edge, Firefox and Safari can all do this, so a different browser or a newer version is the way through.`,
  );
}

/* --- naming and notes --------------------------------------------------- */

function autoMimeFor(file: File): string {
  const byExtension = AUTO_FORMAT_BY_EXTENSION[fileExtension(file.name)];
  if (byExtension) return byExtension;
  const declared = file.type.toLowerCase();
  return declared in EXTENSION_FOR_MIME ? declared : "image/png";
}

function outputName(file: File, mime: string, suffix?: string): string {
  const stem = safeDownloadName(stripExtension(file.name));
  const named = suffix ? `${stem}-${suffix}` : stem;
  return safeDownloadName(withExtension(named, EXTENSION_FOR_MIME[mime] ?? ".png"));
}

/**
 * Says out loud when the file that came back is not the format that was asked
 * for. Silently swapping the codec would be the worst outcome: the user would
 * believe they had an AVIF and hand it to something that cannot read one.
 * Returns an empty string when nothing was substituted, so callers can drop it.
 */
function substitutionNote(encoded: EncodedImage): string {
  if (!encoded.substituted) return "";
  return `this browser cannot encode ${mimeLabel(encoded.requested)} here, so this is a ${mimeLabel(encoded.mime)}`;
}

/** Joins the optional trailing clauses of a note without leaving empty gaps. */
function clauses(...parts: (string | false)[]): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(", ");
}

function beforeAfterNote(file: File, encoded: EncodedImage, extra = ""): string {
  const parts = [
    `${formatBytes(file.size)} → ${formatBytes(encoded.blob.size)}`,
    `${encoded.width}×${encoded.height}`,
  ];
  if (extra) parts.push(extra);
  return parts.join(" · ");
}

/* --- the shared single-image pipeline ----------------------------------- */

interface Plan {
  /** Requested output format, or 'auto' to follow the source. */
  mime: string;
  quality: number;
  background: string;
  /** null keeps the decoded pixel size. */
  output: { width: number; height: number } | null;
  /** null copies the whole image. */
  crop: Rect | null;
  transform: Transform;
  suffix: string;
  /** Builds the note once the real encoded size and dimensions are known. */
  note: (file: File, encoded: EncodedImage, decoded: DecodedImage) => string;
}

interface Job {
  file: File;
  ctx: ToolContext;
  report: Report;
  build: (decoded: DecodedImage) => Plan;
}

async function processImage({ file, ctx, report, build }: Job): Promise<FileOutput> {
  throwIfAborted(ctx);
  report(0.05, "Decoding the image");
  const decoded = await decodeImage(file);
  try {
    throwIfAborted(ctx);
    const plan = build(decoded);
    const requested = plan.mime === "auto" ? autoMimeFor(file) : plan.mime;
    const crop = plan.crop ?? { x: 0, y: 0, width: decoded.width, height: decoded.height };
    report(0.2, "Re-encoding");
    const encoded = await renderImage(decoded, {
      crop,
      width: plan.output?.width ?? decoded.width,
      height: plan.output?.height ?? decoded.height,
      mime: requested,
      quality: plan.quality,
      background: plan.background,
      transform: plan.transform,
    });
    throwIfAborted(ctx);
    const note = plan.note(file, encoded, decoded);
    return {
      name: outputName(file, encoded.mime, plan.suffix),
      blob: encoded.blob,
      previewUrl: URL.createObjectURL(encoded.blob),
      note,
    };
  } finally {
    releaseDecoded(decoded);
  }
}

/* --- batch -------------------------------------------------------------- */

/** Two at a time: enough to overlap decode and encode, few enough to stay light. */
const BATCH_CONCURRENCY = 2;

function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.message === "Cancelled.";
}

function failureMessage(error: unknown): string {
  if (error instanceof Error) {
    const first = error.message.split("\n")[0].trim();
    const looksLikeRuntimeNoise =
      /^(TypeError|RangeError|ReferenceError|SyntaxError|DOMException|Error)[:\s]/i.test(first);
    if (first && !looksLikeRuntimeNoise && first.length <= 300) return first;
  }
  return "Furtu could not process this file. It may be damaged, or in a format this browser cannot read.";
}

type BatchFailure = Error & { outputs?: FileOutput[] };

async function runBatch(
  files: File[],
  ctx: ToolContext,
  work: (file: File, index: number, report: Report) => Promise<FileOutput>,
): Promise<FileOutput[]> {
  const outputs: (FileOutput | null)[] = new Array<FileOutput | null>(files.length).fill(null);
  const failures: string[] = [];
  let next = 0;

  // Each file reports into its own slice of the bar, so a batch of twenty does
  // not have twenty files fighting over one fraction.
  const reportFor =
    (index: number): Report =>
    (fraction, note) => {
      ctx.onProgress(
        Math.min(0.99, (index + Math.max(0, Math.min(1, fraction))) / files.length),
        note,
      );
    };

  const worker = async (): Promise<void> => {
    for (;;) {
      throwIfAborted(ctx);
      const index = next;
      next += 1;
      if (index >= files.length) return;
      try {
        outputs[index] = await work(files[index], index, reportFor(index));
      } catch (error) {
        // A cancel is not a file failure: it has to end the whole batch.
        if (isCancellation(error)) throw error;
        failures.push(`${files[index].name}: ${failureMessage(error)}`);
      }
    }
  };

  const lanes: Promise<void>[] = [];
  for (let i = 0; i < Math.min(BATCH_CONCURRENCY, files.length); i += 1) lanes.push(worker());
  await Promise.all(lanes);

  const succeeded = outputs.filter((entry): entry is FileOutput => entry !== null);
  if (failures.length === 0) {
    ctx.onProgress(1, "Done");
    return succeeded;
  }

  const shown = failures.slice(0, 3);
  const hidden = failures.length - shown.length;
  const message = [
    failures.length === 1
      ? "One file could not be processed."
      : `${failures.length} of ${files.length} files could not be processed.`,
    shown.join(" "),
    hidden > 0 ? `And ${hidden} more.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const error = new Error(message) as BatchFailure;
  if (succeeded.length > 0) error.outputs = succeeded;
  throw error;
}

function throwIfAborted(ctx: ToolContext): void {
  if (ctx.signal.aborted) throw new Error("Cancelled.");
}

/* --- geometry helpers --------------------------------------------------- */

function clampCrop(decoded: DecodedImage, rect: Rect): { crop: Rect; clamped: boolean } {
  const x = Math.max(0, Math.min(rect.x, decoded.width - 1));
  const y = Math.max(0, Math.min(rect.y, decoded.height - 1));
  const width = Math.max(1, Math.min(rect.width, decoded.width - x));
  const height = Math.max(1, Math.min(rect.height, decoded.height - y));
  const clamped = x !== rect.x || y !== rect.y || width !== rect.width || height !== rect.height;
  return { crop: { x, y, width, height }, clamped };
}

function resizeTo(decoded: DecodedImage, values: ControlValues): { width: number; height: number } {
  const width = numberValue(values, "width", 1920, 0, 20000);
  const height = numberValue(values, "height", 0, 0, 20000);

  if (!booleanValue(values, "keepAspect", true)) {
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }
  if (width > 0 && height > 0) {
    // Both axes given: scale to fit inside the box rather than to one edge of
    // it, so the proportions the visitor cares about are kept either way.
    const scale = Math.min(width / decoded.width, height / decoded.height);
    return {
      width: Math.max(1, Math.round(decoded.width * scale)),
      height: Math.max(1, Math.round(decoded.height * scale)),
    };
  }
  if (height > 0) {
    const scale = height / decoded.height;
    return { width: Math.max(1, Math.round(decoded.width * scale)), height };
  }
  const scale = Math.max(1, width) / decoded.width;
  return { width: Math.max(1, width), height: Math.max(1, Math.round(decoded.height * scale)) };
}

/* --- operations --------------------------------------------------------- */

const compressImage: FileOperation = async (files, values, ctx) => {
  return runBatch(files, ctx, (file, _index, report) => {
    const quality = qualityOf(values, 75);
    const format = stringValue(values, "format", "auto");
    return processImage({
      file,
      ctx,
      report,
      build: () => ({
        mime: format,
        quality,
        background: "#ffffff",
        output: null,
        crop: null,
        transform: IDENTITY,
        suffix: "compressed",
        note: (source, encoded) => beforeAfterNote(source, encoded, substitutionNote(encoded)),
      }),
    });
  });
};

const resizeImage: FileOperation = async (files, values, ctx) => {
  return runBatch(files, ctx, (file, _index, report) => {
    const quality = qualityOf(values, 92);
    const format = stringValue(values, "format", "auto");
    return processImage({
      file,
      ctx,
      report,
      build: (decoded) => {
        const output = resizeTo(decoded, values);
        return {
          mime: format,
          quality,
          background: "#ffffff",
          output,
          crop: null,
          transform: IDENTITY,
          suffix: "",
          note: (source, encoded) =>
            beforeAfterNote(
              source,
              encoded,
              clauses(
                encoded.width === decoded.width && encoded.height === decoded.height
                  ? "already this size"
                  : false,
                substitutionNote(encoded),
              ),
            ),
        };
      },
    });
  });
};

const convertImage: FileOperation = async (files, values, ctx) => {
  return runBatch(files, ctx, (file, _index, report) => {
    const quality = qualityOf(values, 85);
    const format = stringValue(values, "format", "image/webp");
    return processImage({
      file,
      ctx,
      report,
      build: () => ({
        mime: format,
        quality,
        background: "#ffffff",
        output: null,
        crop: null,
        transform: IDENTITY,
        suffix: "",
        note: (source, encoded) => beforeAfterNote(source, encoded, substitutionNote(encoded)),
      }),
    });
  });
};

/** Shared body for the three single-direction conversion pages. */
function conversionTo(
  mime: string,
  defaultQuality: number,
  values: ControlValues,
): (file: File, ctx: ToolContext, report: Report) => Promise<FileOutput> {
  const quality = qualityOf(values, defaultQuality);
  const background = stringValue(values, "background", "#ffffff");
  return (file, ctx, report) =>
    processImage({
      file,
      ctx,
      report,
      build: () => ({
        mime,
        quality,
        background,
        output: null,
        crop: null,
        transform: IDENTITY,
        suffix: "",
        note: (source, encoded) => beforeAfterNote(source, encoded, substitutionNote(encoded)),
      }),
    });
}

const jpgToWebp: FileOperation = async (files, values, ctx) => {
  return runBatch(files, ctx, (file, _index, report) =>
    conversionTo("image/webp", 82, values)(file, ctx, report),
  );
};

const pngToWebp: FileOperation = async (files, values, ctx) => {
  return runBatch(files, ctx, (file, _index, report) =>
    conversionTo("image/webp", 90, values)(file, ctx, report),
  );
};

const webpToJpg: FileOperation = async (files, values, ctx) => {
  return runBatch(files, ctx, (file, _index, report) =>
    conversionTo("image/jpeg", 90, values)(file, ctx, report),
  );
};

const cropImage: FileOperation = async (files, values, ctx) => {
  const file = files[0];
  if (!file) throw new Error("Add an image to crop.");
  const quality = qualityOf(values, 95);
  const format = stringValue(values, "format", "auto");
  const requested: Rect = {
    x: numberValue(values, "x", 0, 0, 40000),
    y: numberValue(values, "y", 0, 0, 40000),
    width: numberValue(values, "width", 1200, 1, 40000),
    height: numberValue(values, "height", 1200, 1, 40000),
  };
  return [
    await processImage({
      file,
      ctx,
      report: (fraction, note) => ctx.onProgress(fraction, note),
      build: (decoded) => {
        const { crop, clamped } = clampCrop(decoded, requested);
        return {
          mime: format,
          quality,
          background: "#ffffff",
          output: { width: crop.width, height: crop.height },
          crop,
          transform: IDENTITY,
          suffix: "cropped",
          note: (source, encoded) =>
            beforeAfterNote(
              source,
              encoded,
              clauses(
                clamped
                  ? `cropped to fit the image, which is ${decoded.width}×${decoded.height}`
                  : false,
                substitutionNote(encoded),
              ),
            ),
        };
      },
    }),
  ];
};

const rotateImage: FileOperation = async (files, values, ctx) => {
  const file = files[0];
  if (!file) throw new Error("Add an image to rotate.");
  const quality = qualityOf(values, 95);
  const format = stringValue(values, "format", "auto");
  const transform = TRANSFORM_BY_VALUE[stringValue(values, "degrees", "90")];
  return [
    await processImage({
      file,
      ctx,
      report: (fraction, note) => ctx.onProgress(fraction, note),
      build: () => ({
        mime: format,
        quality,
        background: "#ffffff",
        output: null,
        crop: null,
        transform: transform ?? TRANSFORM_BY_VALUE["90"],
        suffix: "rotated",
        note: (source, encoded) => beforeAfterNote(source, encoded, substitutionNote(encoded)),
      }),
    }),
  ];
};

const flipImage: FileOperation = async (files, values, ctx) => {
  const file = files[0];
  if (!file) throw new Error("Add an image to mirror.");
  const quality = qualityOf(values, 95);
  const format = stringValue(values, "format", "auto");
  const transform = FLIP_BY_VALUE[stringValue(values, "direction", "horizontal")];
  return [
    await processImage({
      file,
      ctx,
      report: (fraction, note) => ctx.onProgress(fraction, note),
      build: () => ({
        mime: format,
        quality,
        background: "#ffffff",
        output: null,
        crop: null,
        transform: transform ?? FLIP_BY_VALUE["horizontal"],
        suffix: "flipped",
        note: (source, encoded) => beforeAfterNote(source, encoded, substitutionNote(encoded)),
      }),
    }),
  ];
};

const removeImageMetadata: FileOperation = async (files, values, ctx) => {
  return runBatch(files, ctx, (file, _index, report) => {
    // A canvas cannot write metadata back out, so the only way to produce a file
    // without it is to write a new one. Quality is kept high so the visible
    // cost of that rewrite is as small as it can be.
    const quality = qualityOf(values, 95);
    const format = stringValue(values, "format", "auto");
    return processImage({
      file,
      ctx,
      report,
      build: () => ({
        mime: format,
        quality,
        background: "#ffffff",
        output: null,
        crop: null,
        transform: IDENTITY,
        suffix: "clean",
        note: (source, encoded) =>
          beforeAfterNote(
            source,
            encoded,
            clauses("rebuilt without EXIF, GPS or IPTC", substitutionNote(encoded)),
          ),
      }),
    });
  });
};

/* --- target-size search ------------------------------------------------- */

const SEARCH_ITERATIONS = 8;
const QUALITY_CEILING = 0.98;
const MIN_LONG_EDGE = 64;
const SHRINK_FACTOR = 0.85;
const GROW_FACTOR = 1.08;
const GROW_STEPS = 6;
/** Below this share of the budget it is worth walking the dimensions back up. */
const FILL_RATIO = 0.7;

interface Attempt extends EncodedImage {
  quality: number;
}

/**
 * "This browser has no encoder for this format" and "this format cannot reach
 * the target" are completely different problems, and conflating them produces a
 * message the visitor cannot act on. So the search reports which one it hit.
 */
interface QualitySearch {
  /** null when the target was not reachable at this size, even at the floor. */
  attempt: Attempt | null;
  supported: boolean;
}

interface TargetDefaults {
  targetKb: number;
  minQuality: number;
}

/** Thrown by the renderer when a format cannot be produced at all. */
class UnsupportedFormatError extends Error {}

function scaled(size: number, factor: number, limit: number): number {
  return Math.max(1, Math.min(limit, Math.round(size * factor)));
}

/**
 * Binary search over quality at a fixed size, keeping the highest setting that
 * still fits. Eight iterations put the answer within about 0.4% of the grid,
 * which is finer than anyone can see in a JPEG artefact.
 */
async function searchQuality(
  decoded: DecodedImage,
  mime: string,
  width: number,
  height: number,
  targetBytes: number,
  floor: number,
  report: Report,
): Promise<QualitySearch> {
  const spec = (quality: number): RenderSpec => ({
    crop: { x: 0, y: 0, width: decoded.width, height: decoded.height },
    width,
    height,
    mime,
    quality,
    background: "#ffffff",
    transform: IDENTITY,
  });

  let low = floor;
  let high = QUALITY_CEILING;
  let best: Attempt | null = null;

  for (let i = 0; i < SEARCH_ITERATIONS; i += 1) {
    const quality = (low + high) / 2;
    report(0.2 + (i / SEARCH_ITERATIONS) * 0.5, `Trying quality ${Math.round(quality * 100)}%`);
    let encoded: EncodedImage;
    try {
      encoded = await renderImage(decoded, spec(quality));
    } catch (error) {
      if (error instanceof UnsupportedFormatError) return { attempt: null, supported: false };
      throw error;
    }
    if (encoded.blob.size <= targetBytes) {
      best = { ...encoded, quality };
      // It fitted, so there may be room for a better setting above it.
      low = quality;
    } else {
      high = quality;
    }
  }

  if (!best) {
    // The floor itself was never sampled, and it is the one quality the visitor
    // explicitly said they were willing to accept.
    report(0.7, "Checking the quality floor");
    const encoded = await renderImage(decoded, spec(floor));
    if (encoded.blob.size <= targetBytes) best = { ...encoded, quality: floor };
  }

  return { attempt: best, supported: true };
}

/**
 * The flagship behaviour: land at or under a byte target with the best picture
 * that still fits, rather than guessing a quality and hoping.
 */
async function compressToTarget(
  file: File,
  ctx: ToolContext,
  report: Report,
  defaults: TargetDefaults,
): Promise<FileOutput> {
  const targetKb = defaults.targetKb;
  const floor = defaults.minQuality / 100;
  const targetBytes = targetKb * 1024;

  throwIfAborted(ctx);
  report(0.05, "Decoding the image");
  const decoded = await decodeImage(file);

  try {
    let best: Attempt | null = null;
    let mime = "";

    for (const candidate of ["image/webp", "image/jpeg"] as const) {
      throwIfAborted(ctx);
      const search = await searchQuality(
        decoded,
        candidate,
        decoded.width,
        decoded.height,
        targetBytes,
        floor,
        report,
      );
      if (!search.supported) continue;
      // The first format the browser can actually encode wins. WebP is tried
      // first because it needs fewer bytes than JPG for the same quality, so it
      // leaves more of the budget for the picture — and if WebP cannot reach the
      // target, JPG certainly cannot, so there is nothing to gain by trying it.
      mime = candidate;
      best = search.attempt;
      break;
    }

    if (!mime) {
      throw new Error(
        "This browser could not encode either WebP or JPG, so Furtu could not produce a file at all. Chrome, Edge, Firefox and Safari can all do this, so a different or newer browser is the way through.",
      );
    }

    // Quality alone was not enough, so step the dimensions down and search again,
    // stopping before the image becomes too small to be worth returning.
    let width = decoded.width;
    let height = decoded.height;
    let scale = 1;
    while (!best) {
      const nextWidth = scaled(width, SHRINK_FACTOR, decoded.width);
      const nextHeight = scaled(height, SHRINK_FACTOR, decoded.height);
      if (Math.max(nextWidth, nextHeight) < MIN_LONG_EDGE) break;
      if (nextWidth === width && nextHeight === height) break;
      throwIfAborted(ctx);
      width = nextWidth;
      height = nextHeight;
      scale = nextWidth / decoded.width;
      report(0.7, `Reducing to ${width}×${height} to reach the target`);
      best = (await searchQuality(decoded, mime, width, height, targetBytes, floor, report))
        .attempt;
    }

    if (!best) {
      throw new Error(
        `A ${targetKb} KB file is not achievable for this image without going below the quality floor of ${Math.round(floor * 100)}%, or without shrinking it under ${MIN_LONG_EDGE} pixels on the long edge. Furtu stopped rather than hand you an unusable thumbnail. Raise the target size, lower the quality floor, or resize the image yourself first.`,
      );
    }

    // It fits. If the result is well under the budget there may be room for more
    // image, so walk the dimensions back up while it still fits. This is what
    // turns a 40 KB result into a 180 KB one when 200 KB was allowed.
    if (best.blob.size < targetBytes * FILL_RATIO && scale < 1) {
      for (let i = 0; i < GROW_STEPS; i += 1) {
        throwIfAborted(ctx);
        const growWidth = Math.min(decoded.width, Math.round(width * GROW_FACTOR));
        const growHeight = Math.min(decoded.height, Math.round(height * GROW_FACTOR));
        if (growWidth === width && growHeight === height) break;
        const grown = await renderImage(decoded, {
          crop: { x: 0, y: 0, width: decoded.width, height: decoded.height },
          width: growWidth,
          height: growHeight,
          mime,
          quality: best.quality,
          background: "#ffffff",
          transform: IDENTITY,
        });
        if (grown.blob.size > targetBytes) break;
        width = growWidth;
        height = growHeight;
        best = { ...grown, quality: best.quality };
        report(0.85, `Filling the budget at ${width}×${height}`);
      }
    }

    const unchanged = best.width === decoded.width && best.height === decoded.height;
    const parts = [
      `${formatBytes(best.blob.size)} · quality ${Math.round(best.quality * 100)} · ${best.width}×${best.height}${
        unchanged ? " unchanged" : ` (resized from ${decoded.width}×${decoded.height})`
      }`,
    ];
    if (best.substituted)
      parts.push(`written as ${mimeLabel(best.mime)} because this browser cannot encode WebP`);
    else if (unchanged && file.size < targetBytes)
      parts.push("the original was already under the target");

    throwIfAborted(ctx);
    report(1, parts[0]);
    return {
      name: outputName(file, best.mime),
      blob: best.blob,
      previewUrl: URL.createObjectURL(best.blob),
      note: parts.join(" · "),
    };
  } finally {
    releaseDecoded(decoded);
  }
}

/** Both target tools run the same search, only the default target differs. */
function targetOperation(defaults: TargetDefaults): FileOperation {
  return async (files, values, ctx) => {
    const overrides: TargetDefaults = {
      targetKb: numberValue(values, "targetKb", defaults.targetKb, 10, 4096),
      minQuality: numberValue(values, "minQuality", defaults.minQuality, 10, 95),
    };
    return runBatch(files, ctx, (file, _index, report) =>
      compressToTarget(file, ctx, report, overrides),
    );
  };
}

const compressImageTo200kb = targetOperation({ targetKb: 200, minQuality: 55 });
const compressImageTo50kb = targetOperation({ targetKb: 50, minQuality: 40 });

import type { EngineChunk, FileOpMap } from "../types";
const file: FileOpMap = {
  "compress-image": compressImage,
  "resize-image": resizeImage,
  "convert-image": convertImage,
  "jpg-to-webp": jpgToWebp,
  "png-to-webp": pngToWebp,
  "webp-to-jpg": webpToJpg,
  "crop-image": cropImage,
  "rotate-image": rotateImage,
  "flip-image": flipImage,
  "remove-image-metadata": removeImageMetadata,
  "compress-image-to-200kb": compressImageTo200kb,
  "compress-image-to-50kb": compressImageTo50kb,
};
export default { file } satisfies EngineChunk;
