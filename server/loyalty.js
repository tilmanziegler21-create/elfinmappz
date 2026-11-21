const STEPS = [0, 5, 10, 15, 0, 5, 10, 15, 20, 10];

export function loyaltyForDelivered(count) {
  const delivered = Math.max(0, Math.floor(Number(count) || 0));
  const step = Math.min(STEPS.length, delivered + 1);
  return { step, percent: STEPS[step - 1] };
}
