/** Field box as percent of PDF page (0–100). Shared by designer, API validation, and payloads. */

export const FIELD_MIN_WIDTH_PERCENT = 2.5;
export const FIELD_MIN_HEIGHT_PERCENT = 2.5;

/** Finer snapping while dragging the resize handle (percent). */
export const FIELD_RESIZE_SNAP_PERCENT = 0.25;

/** Default size for newly placed / dropped fields (percent of page). */
export const FIELD_DEFAULT_WIDTH_PERCENT = 14;
export const FIELD_DEFAULT_HEIGHT_PERCENT = 8;

type FieldGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Keep field box inside the page (0–100%) for API payloads and form controls. */
export function normalizeFieldGeometry<T extends FieldGeometry>(field: T): T {
  const width = Math.max(FIELD_MIN_WIDTH_PERCENT, Number(field.width) || FIELD_MIN_WIDTH_PERCENT);
  const height = Math.max(FIELD_MIN_HEIGHT_PERCENT, Number(field.height) || FIELD_MIN_HEIGHT_PERCENT);
  const x = Math.max(0, Math.min(Number(field.x) || 0, 100 - width));
  const y = Math.max(0, Math.min(Number(field.y) || 0, 100 - height));
  return {
    ...field,
    width: Number(width.toFixed(2)),
    height: Number(height.toFixed(2)),
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
  };
}
