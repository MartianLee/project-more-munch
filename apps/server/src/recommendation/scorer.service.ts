import { Injectable } from '@nestjs/common';

export interface ScoreInput {
  combinedRating: number;
  recentCategories: string[];
  category: string | null;
  visitedInExcludeDays: boolean;
  neverRated: boolean;
  ignoredCount: number;
}

@Injectable()
export class ScorerService {
  calculate(input: ScoreInput): number {
    if (input.visitedInExcludeDays) return 0;
    if (input.neverRated) return 0;
    if (input.ignoredCount >= 3) return 0;

    let score = input.combinedRating;

    if (input.category && input.recentCategories.length > 0 && !input.recentCategories.includes(input.category)) {
      score += 0.5;
    }

    return Math.round(score * 100) / 100;
  }
}
