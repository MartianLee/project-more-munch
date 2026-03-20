import { CollectorService } from './collector.service';
import { H3GridService, SearchCell } from './h3-grid.service';
import { KakaoService, KakaoSearchResult } from './kakao.service';
import { NaverService } from './naver.service';
import { MergerService } from './merger.service';
import { Logger } from '@nestjs/common';

describe('CollectorService', () => {
  let service: CollectorService;
  let h3Grid: jest.Mocked<H3GridService>;
  let kakao: jest.Mocked<KakaoService>;
  let naver: jest.Mocked<NaverService>;
  let merger: jest.Mocked<MergerService>;
  let prisma: any;

  const mockSettings = {
    latitude: 37.5666,
    longitude: 126.9784,
    walkMinutes: 10,
    minRating: 3.5,
    excludeDays: 5,
  };

  const mockCells: SearchCell[] = [
    { h3Index: 'cell1', lat: 37.566, lng: 126.978 },
    { h3Index: 'cell2', lat: 37.570, lng: 126.982 },
  ];

  const mockSearchResult: KakaoSearchResult = {
    places: [
      { id: '1', name: 'Test Restaurant', address: '서울시', latitude: 37.566, longitude: 126.978, category: '한식', rating: null, businessHours: null },
    ],
    totalCount: 1,
    isSaturated: false,
  };

  beforeEach(() => {
    h3Grid = {
      getSearchCells: jest.fn().mockReturnValue(mockCells),
      refineSaturatedCells: jest.fn().mockReturnValue([]),
    } as any;

    kakao = {
      searchRestaurantsWithMeta: jest.fn().mockResolvedValue(mockSearchResult),
    } as any;

    naver = {
      searchRestaurants: jest.fn().mockResolvedValue([]),
    } as any;

    merger = {
      mergeAndSave: jest.fn().mockResolvedValue(undefined),
    } as any;

    prisma = {
      userSettings: {
        findFirst: jest.fn().mockResolvedValue(mockSettings),
      },
      restaurant: {
        updateMany: jest.fn().mockResolvedValue(undefined),
      },
    };

    service = new CollectorService(prisma, kakao, naver, merger, h3Grid);
    Logger.overrideLogger([]);
  });

  afterAll(() => {
    Logger.overrideLogger(undefined as any);
  });

  it('H3 그리드 셀 수만큼 카카오 검색을 호출한다', async () => {
    await service.collect();

    expect(h3Grid.getSearchCells).toHaveBeenCalledWith(37.5666, 126.9784, expect.any(Number));
    expect(kakao.searchRestaurantsWithMeta).toHaveBeenCalledTimes(2);
  });

  it('포화 셀이 있으면 세분화하여 추가 검색한다', async () => {
    const saturatedResult: KakaoSearchResult = {
      places: Array(45).fill(mockSearchResult.places[0]),
      totalCount: 45,
      isSaturated: true,
    };
    kakao.searchRestaurantsWithMeta
      .mockResolvedValueOnce(saturatedResult)
      .mockResolvedValueOnce(mockSearchResult)
      .mockResolvedValue(mockSearchResult);

    const refinedCells: SearchCell[] = [
      { h3Index: 'child1', lat: 37.565, lng: 126.977 },
      { h3Index: 'child2', lat: 37.567, lng: 126.979 },
    ];
    h3Grid.refineSaturatedCells.mockReturnValue(refinedCells);

    await service.collect();

    expect(h3Grid.refineSaturatedCells).toHaveBeenCalledWith(['cell1']);
    expect(kakao.searchRestaurantsWithMeta).toHaveBeenCalledTimes(4);
  });

  it('설정이 없으면 수집하지 않는다', async () => {
    prisma.userSettings.findFirst.mockResolvedValue(null);

    await service.collect();

    expect(h3Grid.getSearchCells).not.toHaveBeenCalled();
  });

  it('수집된 모든 식당을 kakaoId 기준으로 중복 제거하여 merger에 전달한다', async () => {
    const place1 = { ...mockSearchResult.places[0], id: 'dup1' };
    const place2 = { ...mockSearchResult.places[0], id: 'dup1' };
    const place3 = { ...mockSearchResult.places[0], id: 'unique' };

    kakao.searchRestaurantsWithMeta
      .mockResolvedValueOnce({ places: [place1, place2], totalCount: 2, isSaturated: false })
      .mockResolvedValueOnce({ places: [place3], totalCount: 1, isSaturated: false });

    await service.collect();

    const mergedPlaces = merger.mergeAndSave.mock.calls[0][0];
    const ids = mergedPlaces.map((p: any) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
