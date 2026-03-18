import { Injectable } from '@nestjs/common';

const SPONSORED_KEYWORDS = ['체험단', '제공받아', '협찬', '원고료', '소정의'];

@Injectable()
export class NaverFilterService {
  getNaverWeight(description: string): number {
    if (!description) return 0.5;
    const matchCount = SPONSORED_KEYWORDS.filter((kw) => description.includes(kw)).length;
    return matchCount > 0 ? 0.3 : 0.5;
  }

  calculateCombinedRating(
    kakaoRating: number | null,
    naverRating: number | null,
    naverDescription?: string,
  ): number | null {
    if (kakaoRating == null && naverRating == null) return null;
    if (kakaoRating != null && naverRating == null) return kakaoRating;
    if (kakaoRating == null && naverRating != null) return naverRating;

    const naverWeight = this.getNaverWeight(naverDescription ?? '');
    const kakaoWeight = 1 - naverWeight;
    return Math.round((kakaoRating! * kakaoWeight + naverRating! * naverWeight) * 100) / 100;
  }
}
