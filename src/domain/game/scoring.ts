import type { PlayerId, RoundResult } from './types';

export function scoreOrder(predicted: PlayerId[], assignments: Record<PlayerId, number>): RoundResult {
  const correct = [...predicted].sort((a, b) => assignments[a] - assignments[b]);
  let correctlyOrderedPairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < predicted.length; i += 1) {
    for (let j = i + 1; j < predicted.length; j += 1) {
      totalPairs += 1;
      if (assignments[predicted[i]] < assignments[predicted[j]]) correctlyOrderedPairs += 1;
    }
  }
  return { exactOrder: predicted.every((id, index) => id === correct[index]), correctlyOrderedPairs, totalPairs };
}
