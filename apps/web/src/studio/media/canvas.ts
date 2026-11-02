/** RGBA bytes as `ImageData.data` holds them, with the size they cover. */
export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/**
 * Paints on a new canvas of this size and reads its pixels back. The canvas is filled white first:
 * a transparent PNG or a PDF page has no background of its own and would otherwise read as black.
 * Null where the browser has no 2D canvas. `paint` may throw; the caller decides what that means.
 */
export async function paintPixels(
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => Promise<void> | void,
): Promise<Pixels | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  await paint(context, canvas);
  return { data: context.getImageData(0, 0, width, height).data, width, height };
}
