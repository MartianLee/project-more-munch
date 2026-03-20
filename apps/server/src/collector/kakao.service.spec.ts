import { KakaoSearchResult } from './kakao.service';

describe('KakaoService', () => {
  describe('KakaoSearchResult type', () => {
    it('반환 타입에 places와 totalCount, isSaturated가 포함된다', () => {
      const result: KakaoSearchResult = {
        places: [],
        totalCount: 0,
        isSaturated: false,
      };
      expect(result).toHaveProperty('places');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('isSaturated');
    });
  });
});
