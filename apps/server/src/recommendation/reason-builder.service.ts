import { Injectable } from '@nestjs/common';

export interface ReasonInput {
  combinedRating: number | null;
  hasVisited: boolean;
  lastVisitDaysAgo: number | null;
  bestRating: string | null;
  naverBlogCount: number | null;
}

@Injectable()
export class ReasonBuilderService {
  build(input: ReasonInput): string {
    const parts: string[] = [];

    if (input.bestRating === 'AMAZING') {
      parts.push('지난번에 최고라고 한 곳');
    }
    if (!input.hasVisited) {
      parts.push('아직 안 가본 곳');
    }
    if (input.lastVisitDaysAgo != null && input.lastVisitDaysAgo >= 14) {
      parts.push('오랜만에 가볼만한 곳');
    }
    if (input.combinedRating != null && input.combinedRating >= 4.5) {
      parts.push('평점이 매우 높은 곳');
    }
    if (input.naverBlogCount != null && input.naverBlogCount >= 50) {
      parts.push(`리뷰 ${input.naverBlogCount}개로 검증된 곳`);
    }

    if (parts.length === 0) {
      parts.push('평점이 좋은 곳');
    }

    return parts.slice(0, 2).join(', ');
  }
}
