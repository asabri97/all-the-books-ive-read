export function curveRotate(offsetRatio: number): number {
  const limited = Math.max(-1, Math.min(1, offsetRatio));
  if (limited === 0) return 0;
  return -Math.sign(limited) * Math.pow(Math.abs(limited), 1.35) * 34;
}
