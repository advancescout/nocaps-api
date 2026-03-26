type ExpertiseLevel = 'novice' | 'intermediate' | 'expert' | 'thought_leader';

export function calculateFounderCredibility(
  hasExperience: boolean,
  yearsInField: number | null,
  expertise: ExpertiseLevel | null,
  hasShippedBefore: boolean
): { domainScore: number; executionScore: number; credibility: number } {
  const multipliers: Record<ExpertiseLevel, number> = {
    novice: 0.8,
    intermediate: 1.0,
    expert: 1.3,
    thought_leader: 1.5,
  };

  let domainScore = 0;
  if (hasExperience && yearsInField !== null && expertise !== null) {
    domainScore = Math.min(1.0, (yearsInField * (multipliers[expertise] ?? 1.0)) / 5);
  }

  const executionScore = hasShippedBefore ? 1.0 : 0.5;
  const credibility = Math.min(1.0, domainScore * 0.6 + executionScore * 0.4);

  return { domainScore, executionScore, credibility };
}
