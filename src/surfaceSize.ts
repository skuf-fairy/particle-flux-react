export interface SurfaceSizeOptions {
  width: number | string;
  height: number | string;
  pixelRatio?: number;
}
export interface SurfaceSize { width: number; height: number; pixelRatio: number }

function cssPixels(value: string | undefined): number | undefined {
  return value && /^\d*\.?\d+px$/.test(value) ? Number.parseFloat(value) : undefined;
}

/** Read used CSS size, never a transformed bounding rectangle or canvas bitmap dimensions. */
export function readSurfaceSize(surface: Element, options: SurfaceSizeOptions): SurfaceSize {
  const owner = surface.ownerDocument.defaultView;
  const style = owner?.getComputedStyle(surface);
  const dimension = (axis: 'width' | 'height') => {
    const used = cssPixels(style?.[axis]);
    if (used === undefined) return typeof options[axis] === 'number' ? options[axis] : 0;
    const sides = axis === 'width' ? ['Left', 'Right'] : ['Top', 'Bottom'];
    const extras = style?.boxSizing === 'border-box' ? sides.reduce((sum, side) => sum +
      (Number.parseFloat(style.getPropertyValue(`padding-${side.toLowerCase()}`)) || 0) +
      (Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0), 0) : 0;
    return Math.max(0, used - extras);
  };
  return { width: dimension('width'), height: dimension('height'), pixelRatio: options.pixelRatio ?? owner?.devicePixelRatio ?? 1 };
}

export function watchSurfaceSize(
  container: HTMLElement,
  surface: Element,
  options: () => SurfaceSizeOptions,
  onSize: (size: SurfaceSize) => void,
) {
  const owner = surface.ownerDocument.defaultView;
  let alive = true;
  const measure = () => { if (alive) onSize(readSurfaceSize(surface, options())); };
  const Observer = owner?.ResizeObserver ?? globalThis.ResizeObserver;
  const observer = Observer ? new Observer((entries) => {
    if (!alive) return;
    const entry = entries.find((item) => item.target === surface);
    if (entry) {
      onSize({
        width: Math.max(0, entry.contentRect.width), height: Math.max(0, entry.contentRect.height),
        pixelRatio: options().pixelRatio ?? owner?.devicePixelRatio ?? 1,
      });
    } else measure();
  }) : undefined;
  observer?.observe(container);
  if (surface !== container) observer?.observe(surface);
  owner?.addEventListener('resize', measure);
  measure();
  return {
    measure,
    disconnect() {
      alive = false;
      observer?.disconnect();
      owner?.removeEventListener('resize', measure);
    },
  };
}
