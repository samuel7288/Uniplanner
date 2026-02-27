export type GradeInput = {
  score: number;
  maxScore: number;
  weight: number;
  categoryId?: string | null;
};

export type GradeCategoryInput = {
  id: string;
  name: string;
  weight: number;
};

export type GradeProjectionOptions = {
  categories?: GradeCategoryInput[];
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

export function calculateCourseProjection(
  grades: GradeInput[],
  targetGrade = 7,
  options?: GradeProjectionOptions,
): GradeProjection {
  const categories = options?.categories ?? [];
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  let coveredWeight = 0;
  let weightedContribution = 0;
  const uncategorized: GradeInput[] = [];

  const groupedByCategory = new Map<string, GradeInput[]>();
  for (const grade of grades) {
    if (grade.categoryId && categoryById.has(grade.categoryId)) {
      const bucket = groupedByCategory.get(grade.categoryId) ?? [];
      bucket.push(grade);
      groupedByCategory.set(grade.categoryId, bucket);
      continue;
    }
    uncategorized.push(grade);
  }

  for (const category of categories) {
    const categoryGrades = groupedByCategory.get(category.id) ?? [];
    if (categoryGrades.length === 0) continue;

    const averageNormalized =
      categoryGrades.reduce((sum, grade) => {
        if (grade.maxScore <= 0) return sum;
        return sum + grade.score / grade.maxScore;
      }, 0) / categoryGrades.length;

    weightedContribution += averageNormalized * category.weight;
    coveredWeight += category.weight;
  }

  for (const grade of uncategorized) {
    if (grade.maxScore <= 0) continue;
    weightedContribution += (grade.score / grade.maxScore) * grade.weight;
    coveredWeight += grade.weight;
  }

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
