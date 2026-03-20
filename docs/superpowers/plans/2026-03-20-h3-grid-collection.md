# H3 그리드 기반 식당 수집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오 API의 45개 제한을 H3 hexagonal grid로 우회하여 주변 식당을 135~450개까지 수집

**Architecture:** 사용자 위치를 H3 해상도 8 셀로 변환하고, gridDisk로 주변 셀 목록을 생성한 뒤, 각 셀 중심점마다 카카오 API를 호출하여 결과를 병합. 포화 셀(결과 45개)은 해상도 9로 세분화하여 재검색.

**Tech Stack:** h3-js (npm), NestJS, Prisma, Kakao Local API

---

## File Structure

| 파일 | 역할 |
|------|------|
| `src/collector/h3-grid.service.ts` (신규) | H3 그리드 계산: 셀 목록 생성, 중심 좌표 반환, 적응형 세분화 |
| `src/collector/h3-grid.service.spec.ts` (신규) | H3 그리드 서비스 단위 테스트 |
| `src/collector/kakao.service.ts` (수정) | `searchRestaurants`에 결과 수 반환 추가 (포화 감지용) |
| `src/collector/kakao.service.spec.ts` (신규) | KakaoService 단위 테스트 |
| `src/collector/collector.service.ts` (수정) | H3 그리드 기반 수집 로직으로 교체 |
| `src/collector/collector.service.spec.ts` (신규) | CollectorService 단위 테스트 |
| `src/collector/collector.module.ts` (수정) | H3GridService provider 등록 |
| `src/collector/collector.controller.ts` (수정) | 수집 결과에 통계 정보 추가 |

---

### Task 1: h3-js 설치 및 H3GridService 기본 구현

**Files:**
- Create: `apps/server/src/collector/h3-grid.service.ts`
- Create: `apps/server/src/collector/h3-grid.service.spec.ts`

- [ ] **Step 1: h3-js 설치**

```bash
cd apps/server && pnpm add h3-js
```

- [ ] **Step 2: 실패하는 테스트 작성**

`apps/server/src/collector/h3-grid.service.spec.ts`:

```typescript
import { H3GridService } from './h3-grid.service';

describe('H3GridService', () => {
  let service: H3GridService;

  beforeEach(() => {
    service = new H3GridService();
  });

  describe('getSearchCells', () => {
    it('서울 시청 기준 해상도 8 셀 목록을 반환한다', () => {
      const cells = service.getSearchCells(37.5666, 126.9784, 800);
      // 800m 반경 → gridDisk k=1~2, 최소 3개 셀
      expect(cells.length).toBeGreaterThanOrEqual(3);
      // 각 셀은 { h3Index, lat, lng } 형태
      for (const cell of cells) {
        expect(cell).toHaveProperty('h3Index');
        expect(cell).toHaveProperty('lat');
        expect(cell).toHaveProperty('lng');
        expect(typeof cell.lat).toBe('number');
        expect(typeof cell.lng).toBe('number');
      }
    });

    it('1200m 반경이면 더 많은 셀을 반환한다', () => {
      const cells800 = service.getSearchCells(37.5666, 126.9784, 800);
      const cells1200 = service.getSearchCells(37.5666, 126.9784, 1200);
      expect(cells1200.length).toBeGreaterThan(cells800.length);
    });

    it('반환된 셀의 좌표는 유효한 위경도이다', () => {
      const cells = service.getSearchCells(37.5666, 126.9784, 800);
      for (const cell of cells) {
        expect(cell.lat).toBeGreaterThan(30);
        expect(cell.lat).toBeLessThan(45);
        expect(cell.lng).toBeGreaterThan(120);
        expect(cell.lng).toBeLessThan(135);
      }
    });
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
cd apps/server && npx jest src/collector/h3-grid.service.spec.ts --no-cache
```

Expected: FAIL — `Cannot find module './h3-grid.service'`

- [ ] **Step 4: 최소 구현**

`apps/server/src/collector/h3-grid.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { latLngToCell, gridDisk, cellToLatLng } from 'h3-js';

export interface SearchCell {
  h3Index: string;
  lat: number;
  lng: number;
}

const H3_RESOLUTION = 8;
const H3_EDGE_LENGTH_M = 531; // 해상도 8 변 길이

@Injectable()
export class H3GridService {
  /**
   * 주어진 위치와 반경에 대해 검색할 H3 셀 목록을 반환한다.
   * @param lat 중심 위도
   * @param lng 중심 경도
   * @param radiusM 검색 반경 (미터)
   * @returns 검색할 셀 목록 (중심 좌표 포함)
   */
  getSearchCells(lat: number, lng: number, radiusM: number): SearchCell[] {
    const centerCell = latLngToCell(lat, lng, H3_RESOLUTION);
    const k = Math.max(1, Math.ceil(radiusM / (H3_EDGE_LENGTH_M * 2)));
    const cells = gridDisk(centerCell, k);

    return cells.map((h3Index) => {
      const [cellLat, cellLng] = cellToLatLng(h3Index);
      return { h3Index, lat: cellLat, lng: cellLng };
    });
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd apps/server && npx jest src/collector/h3-grid.service.spec.ts --no-cache
```

Expected: PASS (3 tests)

- [ ] **Step 6: 커밋**

```bash
git add apps/server/package.json apps/server/pnpm-lock.yaml apps/server/src/collector/h3-grid.service.ts apps/server/src/collector/h3-grid.service.spec.ts
git commit -m "feat(collector): add H3GridService with getSearchCells"
```

---

### Task 2: 적응형 세분화 (Adaptive Refinement)

**Files:**
- Modify: `apps/server/src/collector/h3-grid.service.ts`
- Modify: `apps/server/src/collector/h3-grid.service.spec.ts`

- [ ] **Step 1: 세분화 테스트 추가**

`apps/server/src/collector/h3-grid.service.spec.ts`에 추가:

```typescript
describe('refineSaturatedCells', () => {
  it('포화 셀을 해상도 9 자식 셀로 세분화한다', () => {
    const cells = service.getSearchCells(37.5666, 126.9784, 800);
    const saturatedIndex = cells[0].h3Index;

    const refined = service.refineSaturatedCells([saturatedIndex]);
    // 해상도 8 → 9: 약 7개 자식 셀
    expect(refined.length).toBe(7);
    for (const cell of refined) {
      expect(cell).toHaveProperty('h3Index');
      expect(cell).toHaveProperty('lat');
      expect(cell).toHaveProperty('lng');
    }
  });

  it('빈 배열을 넣으면 빈 배열을 반환한다', () => {
    const refined = service.refineSaturatedCells([]);
    expect(refined).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd apps/server && npx jest src/collector/h3-grid.service.spec.ts --no-cache
```

Expected: FAIL — `service.refineSaturatedCells is not a function`

- [ ] **Step 3: 세분화 구현**

`apps/server/src/collector/h3-grid.service.ts`에 메서드 추가:

```typescript
import { latLngToCell, gridDisk, cellToLatLng, cellToChildren } from 'h3-js';

// 클래스 내부에 추가:
const H3_FINE_RESOLUTION = 9;

  /**
   * 포화된 셀(결과 45개)을 더 세밀한 해상도로 세분화한다.
   * @param saturatedH3Indexes 포화된 셀의 H3 인덱스 배열
   * @returns 세분화된 자식 셀 목록
   */
  refineSaturatedCells(saturatedH3Indexes: string[]): SearchCell[] {
    const childCells: SearchCell[] = [];
    for (const parentIndex of saturatedH3Indexes) {
      const children = cellToChildren(parentIndex, H3_FINE_RESOLUTION);
      for (const childIndex of children) {
        const [lat, lng] = cellToLatLng(childIndex);
        childCells.push({ h3Index: childIndex, lat, lng });
      }
    }
    return childCells;
  }
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd apps/server && npx jest src/collector/h3-grid.service.spec.ts --no-cache
```

Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/server/src/collector/h3-grid.service.ts apps/server/src/collector/h3-grid.service.spec.ts
git commit -m "feat(collector): add adaptive refinement for saturated H3 cells"
```

---

### Task 3: KakaoService에 포화 감지 기능 추가

**Files:**
- Modify: `apps/server/src/collector/kakao.service.ts`
- Create: `apps/server/src/collector/kakao.service.spec.ts`

- [ ] **Step 1: 테스트 작성**

`apps/server/src/collector/kakao.service.spec.ts`:

```typescript
import { KakaoService, KakaoSearchResult } from './kakao.service';
import { ConfigService } from '@nestjs/config';

describe('KakaoService', () => {
  describe('searchRestaurantsWithMeta', () => {
    it('반환 타입에 places와 totalCount가 포함된다', () => {
      // 타입 체크만 — 실제 API 호출은 통합 테스트에서
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd apps/server && npx jest src/collector/kakao.service.spec.ts --no-cache
```

Expected: FAIL — `KakaoSearchResult` not exported

- [ ] **Step 3: KakaoService 수정**

`apps/server/src/collector/kakao.service.ts` 수정:

기존 `KakaoPlace` 인터페이스 아래에 추가:

```typescript
export interface KakaoSearchResult {
  places: KakaoPlace[];
  totalCount: number;
  isSaturated: boolean;
}
```

기존 `searchRestaurants` 메서드는 유지하고, 새 메서드 추가:

```typescript
  async searchRestaurantsWithMeta(lat: number, lon: number, radiusM: number): Promise<KakaoSearchResult> {
    const places: KakaoPlace[] = [];
    let page = 1;
    let isEnd = false;
    let totalCount = 0;

    while (!isEnd && page <= 3) {
      const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=FD6&x=${lon}&y=${lat}&radius=${radiusM}&page=${page}&size=15&sort=accuracy`;
      const data = await this.fetchWithRetry(url);
      if (!data) break;

      totalCount = data.meta.pageable_count;
      isEnd = data.meta.is_end;
      for (const doc of data.documents) {
        places.push({
          id: doc.id,
          name: doc.place_name,
          address: doc.road_address_name || doc.address_name,
          latitude: parseFloat(doc.y),
          longitude: parseFloat(doc.x),
          category: this.parseCategory(doc.category_name),
          rating: null,
          businessHours: null,
        });
      }
      page++;
      // 100ms 간격 유지
      if (!isEnd && page <= 3) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return {
      places,
      totalCount,
      isSaturated: totalCount >= 45,
    };
  }
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd apps/server && npx jest src/collector/kakao.service.spec.ts --no-cache
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/server/src/collector/kakao.service.ts apps/server/src/collector/kakao.service.spec.ts
git commit -m "feat(collector): add searchRestaurantsWithMeta with saturation detection"
```

---

### Task 4: CollectorService를 H3 그리드 기반으로 리팩터링

**Files:**
- Modify: `apps/server/src/collector/collector.service.ts`
- Create: `apps/server/src/collector/collector.service.spec.ts`
- Modify: `apps/server/src/collector/collector.module.ts`

- [ ] **Step 1: 테스트 작성**

`apps/server/src/collector/collector.service.spec.ts`:

```typescript
import { CollectorService } from './collector.service';
import { H3GridService, SearchCell } from './h3-grid.service';
import { KakaoService, KakaoSearchResult } from './kakao.service';
import { NaverService } from './naver.service';
import { MergerService } from './merger.service';
import { PrismaService } from '../prisma/prisma.service';
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
    // Suppress logger output in tests
    Logger.overrideLogger([]);
  });

  afterAll(() => {
    Logger.overrideLogger(undefined as any);
  });

  it('H3 그리드 셀 수만큼 카카오 검색을 호출한다', async () => {
    await service.collect();

    expect(h3Grid.getSearchCells).toHaveBeenCalledWith(37.5666, 126.9784, expect.any(Number));
    expect(kakao.searchRestaurantsWithMeta).toHaveBeenCalledTimes(2); // 2 cells
  });

  it('포화 셀이 있으면 세분화하여 추가 검색한다', async () => {
    const saturatedResult: KakaoSearchResult = {
      places: Array(45).fill(mockSearchResult.places[0]),
      totalCount: 45,
      isSaturated: true,
    };
    kakao.searchRestaurantsWithMeta
      .mockResolvedValueOnce(saturatedResult)   // cell1 → 포화
      .mockResolvedValueOnce(mockSearchResult)  // cell2 → 정상
      .mockResolvedValue(mockSearchResult);      // 세분화 셀

    const refinedCells: SearchCell[] = [
      { h3Index: 'child1', lat: 37.565, lng: 126.977 },
      { h3Index: 'child2', lat: 37.567, lng: 126.979 },
    ];
    h3Grid.refineSaturatedCells.mockReturnValue(refinedCells);

    await service.collect();

    expect(h3Grid.refineSaturatedCells).toHaveBeenCalledWith(['cell1']);
    // 2 원본 셀 + 2 세분화 셀 = 4 호출
    expect(kakao.searchRestaurantsWithMeta).toHaveBeenCalledTimes(4);
  });

  it('설정이 없으면 수집하지 않는다', async () => {
    prisma.userSettings.findFirst.mockResolvedValue(null);

    await service.collect();

    expect(h3Grid.getSearchCells).not.toHaveBeenCalled();
  });

  it('수집된 모든 식당을 kakaoId 기준으로 중복 제거하여 merger에 전달한다', async () => {
    const place1 = { ...mockSearchResult.places[0], id: 'dup1' };
    const place2 = { ...mockSearchResult.places[0], id: 'dup1' }; // 같은 id
    const place3 = { ...mockSearchResult.places[0], id: 'unique' };

    kakao.searchRestaurantsWithMeta
      .mockResolvedValueOnce({ places: [place1, place2], totalCount: 2, isSaturated: false })
      .mockResolvedValueOnce({ places: [place3], totalCount: 1, isSaturated: false });

    await service.collect();

    const mergedPlaces = merger.mergeAndSave.mock.calls[0][0];
    const ids = mergedPlaces.map((p: any) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // 중복 없음
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd apps/server && npx jest src/collector/collector.service.spec.ts --no-cache
```

Expected: FAIL — `CollectorService` constructor doesn't accept `H3GridService`

- [ ] **Step 3: CollectorService 리팩터링**

`apps/server/src/collector/collector.service.ts` 전체 교체:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KakaoService, KakaoPlace } from './kakao.service';
import { NaverService } from './naver.service';
import { MergerService } from './merger.service';
import { H3GridService } from './h3-grid.service';

const SEARCH_RADIUS_M = 600; // H3 해상도 8 셀에 맞는 검색 반경
const CELL_DELAY_MS = 100;   // 셀 간 요청 간격

@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kakao: KakaoService,
    private readonly naver: NaverService,
    private readonly merger: MergerService,
    private readonly h3Grid: H3GridService,
  ) {}

  @Cron('0 4 * * *')
  async dailyUpdate() {
    this.logger.log('Starting daily restaurant data update');
    await this.collect();
  }

  @Cron('0 4 * * 0')
  async weeklyFullScan() {
    this.logger.log('Starting weekly full restaurant scan');
    await this.collect();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    await this.prisma.restaurant.updateMany({
      where: { lastSyncedAt: { lt: oneWeekAgo } },
      data: { isActive: false },
    });
  }

  async collect(): Promise<{ totalRestaurants: number; cellsSearched: number; saturatedCells: number }> {
    const settings = await this.prisma.userSettings.findFirst();
    if (!settings) {
      this.logger.warn('No user settings found, skipping collection');
      return { totalRestaurants: 0, cellsSearched: 0, saturatedCells: 0 };
    }

    const radiusM = Math.round(settings.walkMinutes * 80 * 1.2);
    const cells = this.h3Grid.getSearchCells(settings.latitude, settings.longitude, radiusM);
    this.logger.log(`Searching ${cells.length} H3 cells (radius ${radiusM}m)`);

    const allPlaces = new Map<string, KakaoPlace>(); // kakaoId → place (중복 제거)
    const saturatedIndexes: string[] = [];

    // Phase 1: 기본 셀 검색
    for (const cell of cells) {
      const result = await this.kakao.searchRestaurantsWithMeta(cell.lat, cell.lng, SEARCH_RADIUS_M);
      for (const place of result.places) {
        allPlaces.set(place.id, place);
      }
      if (result.isSaturated) {
        saturatedIndexes.push(cell.h3Index);
      }
      await this.delay(CELL_DELAY_MS);
    }

    // Phase 2: 포화 셀 세분화
    if (saturatedIndexes.length > 0) {
      const refinedCells = this.h3Grid.refineSaturatedCells(saturatedIndexes);
      this.logger.log(`Refining ${saturatedIndexes.length} saturated cells → ${refinedCells.length} sub-cells`);

      for (const cell of refinedCells) {
        const result = await this.kakao.searchRestaurantsWithMeta(cell.lat, cell.lng, SEARCH_RADIUS_M);
        for (const place of result.places) {
          allPlaces.set(place.id, place);
        }
        await this.delay(CELL_DELAY_MS);
      }
    }

    const kakaoPlaces = Array.from(allPlaces.values());

    // 네이버 보조 검색
    try {
      const naverPlaces = await this.naver.searchRestaurants(
        `${settings.latitude},${settings.longitude} 맛집`,
      );
      await this.merger.mergeAndSave(kakaoPlaces, naverPlaces);
    } catch (error) {
      this.logger.warn('Naver search failed, merging Kakao-only', error);
      await this.merger.mergeAndSave(kakaoPlaces, []);
    }

    const stats = {
      totalRestaurants: kakaoPlaces.length,
      cellsSearched: cells.length + (saturatedIndexes.length > 0
        ? this.h3Grid.refineSaturatedCells(saturatedIndexes).length
        : 0),
      saturatedCells: saturatedIndexes.length,
    };

    this.logger.log(
      `Collection complete: ${stats.totalRestaurants} restaurants from ${stats.cellsSearched} cells (${stats.saturatedCells} saturated)`,
    );

    return stats;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd apps/server && npx jest src/collector/collector.service.spec.ts --no-cache
```

Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/server/src/collector/collector.service.ts apps/server/src/collector/collector.service.spec.ts
git commit -m "feat(collector): refactor to H3 grid-based collection with deduplication"
```

---

### Task 5: CollectorModule 및 Controller 업데이트

**Files:**
- Modify: `apps/server/src/collector/collector.module.ts`
- Modify: `apps/server/src/collector/collector.controller.ts`

- [ ] **Step 1: CollectorModule에 H3GridService 등록**

`apps/server/src/collector/collector.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CollectorController } from './collector.controller';
import { CollectorService } from './collector.service';
import { KakaoService } from './kakao.service';
import { NaverService } from './naver.service';
import { MergerService } from './merger.service';
import { NaverFilterService } from './naver-filter.service';
import { MenuCollectorService } from './menu-collector.service';
import { H3GridService } from './h3-grid.service';

@Module({
  controllers: [CollectorController],
  providers: [CollectorService, KakaoService, NaverService, MergerService, NaverFilterService, MenuCollectorService, H3GridService],
  exports: [CollectorService, KakaoService],
})
export class CollectorModule {}
```

- [ ] **Step 2: CollectorController에 통계 반환 추가**

`apps/server/src/collector/collector.controller.ts`:

```typescript
import { Controller, Post, HttpCode } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { CollectorService } from './collector.service';

@ApiTags('collector')
@ApiSecurity('X-API-Key')
@Controller('collector')
export class CollectorController {
  constructor(private readonly collector: CollectorService) {}

  @Post('run')
  @HttpCode(200)
  @ApiOperation({ summary: '식당 데이터 수동 수집 트리거 (H3 그리드 기반)' })
  async run() {
    const stats = await this.collector.collect();
    return {
      message: 'Collection completed',
      ...stats,
    };
  }
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd apps/server && pnpm build
```

Expected: 빌드 성공, 에러 없음

- [ ] **Step 4: 전체 테스트 실행**

```bash
cd apps/server && npx jest --no-cache
```

Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/server/src/collector/collector.module.ts apps/server/src/collector/collector.controller.ts
git commit -m "feat(collector): register H3GridService and return collection stats"
```

---

### Task 6: 통합 테스트 (수동)

- [ ] **Step 1: 서버 실행**

```bash
cd apps/server && pnpm start:dev
```

- [ ] **Step 2: 수집 실행 및 결과 확인**

```bash
curl -s -X POST http://localhost:19848/collector/run \
  -H "X-API-Key: <SEED_API_KEY>" | jq .
```

Expected 응답 예시:
```json
{
  "message": "Collection completed",
  "totalRestaurants": 135,
  "cellsSearched": 5,
  "saturatedCells": 1
}
```

- 기존 45개 → 100개 이상으로 증가했는지 확인
- `saturatedCells` > 0이면 적응형 세분화가 동작한 것

- [ ] **Step 3: 관리자 대시보드에서 식당 수 확인**

```
http://localhost:19848/admin
```

식당 목록에서 이전보다 많은 식당이 표시되는지 확인

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "feat(collector): complete H3 grid-based collection strategy (Phase 1+2)"
```
