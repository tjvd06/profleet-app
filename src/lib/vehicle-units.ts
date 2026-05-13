// kW ↔ PS conversion helpers.
// DB stores only power_kw; PS is a display value, computed on the fly.

export const KW_TO_PS = 1.35962;

export function kwToPs(kw: number | null | undefined): number | null {
  if (kw == null) return null;
  return Math.round(kw * KW_TO_PS);
}

export function psToKw(ps: number | null | undefined): number | null {
  if (ps == null) return null;
  return Math.round(ps / KW_TO_PS);
}

// For range filters: floor on lower bound, ceil on upper bound, so that the
// kW-converted predicate never excludes a vehicle the user would expect to see.
export function psToKwFloor(ps: number): number {
  return Math.floor(ps / KW_TO_PS);
}

export function psToKwCeil(ps: number): number {
  return Math.ceil(ps / KW_TO_PS);
}
