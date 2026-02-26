export type GradeInput = {
  score: number;
  maxScore: number;
  weight: number;
};

export type GradeProjection = {
  coveredWeight: number;
  currentAverage: number;
  projectedFinal: number;
  neededAverageForTarget: number | null;
  feasible: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calculateCourseProjection(grades: GradeInput[], targetGrade = 7): GradeProjection {
  const coveredWeight = grades.reduce((acc, item) => acc + item.weight, 0);
  const weightedContribution = grades.reduce((acc, item) => {
    if (item.maxScore <= 0) return acc;
    return acc + (item.score / item.maxScore) * item.weight;
  }, 0);

  const currentAverage =
    coveredWeight > 0 ? (weightedContribution / coveredWeight) * 10 : 0;

  const remainingWeight = Math.max(0, 100 - coveredWeight);
  const projectedFinal =
    coveredWeight > 0
      ? ((weightedContribution + (currentAverage / 10) * remainingWeight) / 100) * 10
      : 0;

  let neededAverageForTarget: number | null = null;
  let feasible = true;

  if (remainingWeight > 0) {
    const neededNormalized = (targetGrade * 10 - weightedContribution) / remainingWeight;
    neededAverageForTarget = clamp(neededNormalized * 10, 0, 10);
    feasible = neededNormalized <= 1;
  } else {
    neededAverageForTarget = weightedContribution / 10;
    feasible = neededAverageForTarget >= targetGrade;
  }

  return {
    coveredWeight,
    currentAverage,
    projectedFinal,
    neededAverageForTarget,
    feasible,
  };
}
