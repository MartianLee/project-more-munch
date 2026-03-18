import { ScorerService } from './scorer.service';

describe('ScorerService', () => {
  const scorer = new ScorerService();

  it('should return combinedRating as base score', () => {
    const score = scorer.calculate({
      combinedRating: 4.5,
      recentCategories: [],
      category: '한식',
      visitedInExcludeDays: false,
      neverRated: false,
      ignoredCount: 0,
    });
    expect(score).toBe(4.5);
  });

  it('should return 0 for recently visited', () => {
    const score = scorer.calculate({
      combinedRating: 4.5,
      recentCategories: [],
      category: '한식',
      visitedInExcludeDays: true,
      neverRated: false,
      ignoredCount: 0,
    });
    expect(score).toBe(0);
  });

  it('should return 0 for NEVER rated', () => {
    const score = scorer.calculate({
      combinedRating: 4.5,
      recentCategories: [],
      category: '한식',
      visitedInExcludeDays: false,
      neverRated: true,
      ignoredCount: 0,
    });
    expect(score).toBe(0);
  });

  it('should return 0 for ignored 3+ times', () => {
    const score = scorer.calculate({
      combinedRating: 4.5,
      recentCategories: [],
      category: '한식',
      visitedInExcludeDays: false,
      neverRated: false,
      ignoredCount: 3,
    });
    expect(score).toBe(0);
  });

  it('should add diversity bonus for different category', () => {
    const score = scorer.calculate({
      combinedRating: 4.0,
      recentCategories: ['중식', '일식', '양식'],
      category: '한식',
      visitedInExcludeDays: false,
      neverRated: false,
      ignoredCount: 0,
    });
    expect(score).toBe(4.5);
  });
});
