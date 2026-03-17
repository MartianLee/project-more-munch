# More Munch Design Spec

## Overview

직장인 점심 추천 서비스. OpenClaw AI agent가 매일 점심 식당을 추천하고, 방문 기록과 피드백을 쌓아 개인화된 추천으로 발전시킨다. 카카오/네이버 API에서 식당 데이터를 수집하고, 유저 피드백으로 정제한다.

## System Architecture

```
OpenClaw Gateway
  ├─ Pi Agent
  └─ More Munch Skill (workspace skill)
     ├─ 추천 요청 → API 호출
     ├─ 피드백 수집 → API 호출
     └─ 설정 변경 → API 호출
         │ REST API (API Key 인증)
         ▼
More Munch Server (NestJS)
  ├─ Recommend Module (추천 로직 + 점수 계산)
  ├─ Visit Module (방문 기록 + 피드백 CRUD)
  ├─ Restaurant Module (식당 데이터 캐시)
  ├─ Settings Module (유저 설정)
  ├─ Collector Module (외부 API 수집 — cron)
  │   ├─ Kakao Places API (동등 비중)
  │   └─ Naver Search API (동등 비중)
  │   └─ Merger (양쪽 데이터 병합, 통합 평점 산출)
  └─ Auth Guard (API Key)
         │
SQLite (Prisma ORM, 파일 기반)
         │
k3s (미니PC) — localhost:19848
```

### 핵심 원칙

- 서버는 **순수 API 서버** — UI 없음, LLM-friendly JSON 응답
- OpenClaw Skill은 **얇은 오케스트레이션** — 추천/피드백/설정 API 호출만
- 외부 API(카카오/네이버) **동등 비중** — 카카오(안정적 영업시간) + 네이버(최신 정보, 블로그 리뷰). 네이버 체험단 등 허위 정보는 수집 시점에 필터링
- **1순위 강추 + 대안 2곳** — 결정 피로를 줄이는 구조
- **점수 기반 추천 엔진** — MVP는 단순 규칙, 향후 가중치 알고리즘으로 확장 가능한 추상화

## Tech Stack

| 레이어 | 기술 |
|--------|------|
| Backend | NestJS (TypeScript) |
| ORM | Prisma |
| Database | SQLite (파일 기반) |
| Auth | API Key (X-API-Key 헤더) |
| External APIs | Kakao Places API, Naver Search API |
| Client | OpenClaw Workspace Skill |
| Scheduler | @nestjs/schedule (cron) |
| Infra | k3s (미니PC) |
| API Docs | Swagger (@nestjs/swagger) |
| Port | 19848 |

## Data Model

```prisma
model User {
  id              Int              @id @default(autoincrement())
  nickname        String
  apiKey          String           @unique
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  settings        UserSettings?
  visits          Visit[]
  recommendations Recommendation[]
}

model UserSettings {
  id          Int      @id @default(autoincrement())
  userId      Int      @unique
  user        User     @relation(fields: [userId], references: [id])
  latitude    Float    // 직장 위도
  longitude   Float    // 직장 경도
  walkMinutes Int      @default(10)   // 도보 제한 (분)
  minRating   Float    @default(3.5)  // 최소 평점
  excludeDays Int      @default(5)    // 최근 N일 방문 배제
  updatedAt   DateTime @updatedAt
}

model Restaurant {
  id              Int              @id @default(autoincrement())
  name            String
  address         String
  latitude        Float
  longitude       Float
  category        String?          // 한식, 중식, 일식, 양식 ...
  priceRange      String?          // 저가, 중가, 고가
  kakaoId         String?          @unique
  kakaoRating     Float?
  naverId         String?          @unique
  naverRating     Float?
  naverBlogCount  Int?             // 블로그 리뷰 수 (인기도 지표)
  combinedRating  Float?           // 통합 평점 (양쪽 가중 평균)
  businessHours   Json?            // { "mon": "11:00-21:00", ... }
  holidays        Json?            // ["sun"] 또는 특정 날짜
  isActive        Boolean          @default(true)
  lastSyncedAt    DateTime
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  menus           MenuItem[]
  visits          Visit[]
  recommendations Recommendation[]

  @@unique([name, address])
}

model MenuItem {
  id           Int        @id @default(autoincrement())
  restaurantId Int
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  name         String     // 짬뽕, 탕수육 ...
  price        Int?       // 원
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  @@unique([restaurantId, name])
}

model Visit {
  id               Int             @id @default(autoincrement())
  userId           Int
  user             User            @relation(fields: [userId], references: [id])
  restaurantId     Int
  restaurant       Restaurant      @relation(fields: [restaurantId], references: [id])
  recommendationId Int?            // 추천에서 선택한 경우 연결
  recommendation   Recommendation? @relation(fields: [recommendationId], references: [id])
  rating           Rating?         // 5단계 평가
  menu             String?         // 먹은 메뉴 (선택)
  comment          String?         // 한줄평 (선택)
  visitedAt        DateTime        @default(now())
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
}

model Recommendation {
  id            Int        @id @default(autoincrement())
  userId        Int
  user          User       @relation(fields: [userId], references: [id])
  restaurantId  Int
  restaurant    Restaurant @relation(fields: [restaurantId], references: [id])
  rank          Int        // 추천 순위 (1, 2, 3)
  score         Float      // 추천 점수 (알고리즘 디버깅용)
  chosen        Boolean    @default(false) // 유저가 실제 방문했는지
  recommendedAt DateTime   @default(now())
  visits        Visit[]

  @@index([userId, recommendedAt])
}

enum Rating {
  AMAZING  // 최고
  GOOD     // 좋았다
  OKAY     // 보통
  BAD      // 별로
  NEVER    // 다시는 안 감
}
```

### 거리 계산

- **Haversine 공식**으로 직선 거리 계산 후, **도보 속도 80m/분** 기준으로 도보 시간 산출
- `walkMinutes` 필터링: `직선거리(m) / 80 <= walkMinutes`
- 응답의 `distance` 필드: `"도보 N분"` 형태 (반올림)
- MVP에서는 직선거리 기반. 향후 외부 도보 경로 API로 정확도 개선 가능

## Recommendation Algorithm

### MVP (규칙 기반)

각 식당에 추천 점수를 계산하여 상위 N곳 추천:

```
사전 필터:
  - isActive = true
  - walkMinutes 이내
  - combinedRating >= minRating (combinedRating이 null이면 제외)
  - 오늘 요일이 businessHours에 포함 (영업시간 있으면 점심시간 11:00-14:00 영업 중인지 확인)
  - NEVER 평가 받은 식당 → 영구 배제
  - 최근 excludeDays일 이내 방문한 곳 → 배제

추천 점수 = combinedRating
          + 카테고리 다양성 보너스 (최근 3일 카테고리와 다르면 +0.5)
```

### 향후 확장 (가중치 기반)

```
추천 점수 = 기본 점수 (combinedRating, 거리)
          × 방문 감쇠 (최근일수록 낮게, 시간 지나면 회복)
          × 선택률 (chosen 횟수 / 추천 횟수, 0이면 감쇠)
          × 평가 가중치 (AMAZING → 부스트, BAD → 감쇠)
          + 카테고리 다양성 보너스
          + 미방문 보너스
```

점수 계산 레이어를 분리하여, 로직 교체만으로 MVP → 가중치 전환 가능.

### 추천 이력 → 선택률 반영 (MVP)

- N회 이상 추천했는데 한번도 방문하지 않은 식당 → 배제 (기본 N=3)
- 향후 연속적인 가중치로 전환

### 콜드스타트 전략

- 초반: 카테고리 골고루 + combinedRating 순으로 추천
- 피드백 쌓이면서 자연스럽게 선호도 학습
- 명시적 선호도 질문 없음 — 데이터로 알아감

### 추천 결과 없음

필터 조건에 맞는 식당이 없으면:

```json
{
  "pick": null,
  "alternatives": [],
  "message": "조건에 맞는 식당이 없습니다. 거리나 평점 기준을 조정해보세요.",
  "recommendedAt": "2026-03-17T11:00:00Z"
}
```

### reason 필드 생성

템플릿 기반으로 서버가 생성. 예시:

| 조건 | reason |
|------|--------|
| combinedRating >= 4.5 | "평점이 매우 높은 곳" |
| 미방문 | "아직 안 가본 곳" |
| AMAZING 평가 이력 | "지난번에 최고라고 한 곳" |
| 최근 방문 없음 (14일+) | "오랜만에 가볼만한 곳" |
| 블로그 리뷰 많음 | "리뷰 N개로 검증된 곳" |

조건을 조합하여 1-2문장으로 생성.

## Data Collection

### 수집 주기

- **매일 04:00** — 기존 식당 데이터 갱신 (평점, 리뷰 수, 영업시간, 메뉴 변동)
- **매주 일요일 04:00** — 전체 재스캔 (신규 오픈 탐색, 폐업 감지, `isActive` 업데이트)

### 수집 범위

유저의 직장 좌표 기준으로 `walkMinutes × 80m` 반경 + 20% 여유분. 예: 도보 10분 설정 → 반경 960m.

1인용 MVP에서는 단일 유저 설정 기준으로 수집. 다중 유저 확장 시 모든 유저 좌표의 합집합 영역으로 확장.

### 수집 파이프라인

1. **Kakao Places API** — 직장 좌표 기준 반경 검색, 식당 목록 + 평점 + 영업시간
2. **Naver Search API** — 동일 영역 검색, 식당 목록 + 평점 + 블로그 리뷰 수 + 메뉴
3. **Merger** — 식당명 + 주소로 양쪽 데이터 매칭, `combinedRating` 산출
4. **네이버 필터링** — 체험단/광고성 블로그 리뷰 감지 및 가중치 하향

### 통합 평점 산출

```
combinedRating = (kakaoRating × 0.5) + (naverRating × 0.5)
```

- 양쪽 모두 있으면 평균
- 한쪽만 있으면 해당 값 사용
- 양쪽 모두 없으면 `combinedRating = null` → 추천에서 제외
- 네이버 체험단 의심 시: 블로그 리뷰 중 "체험단", "제공받아", "협찬" 키워드 포함 비율이 30% 이상이면 네이버 비중을 0.5 → 0.3으로 하향

### 수집 실패 처리

- API 호출 실패 시 최대 3회 재시도 (exponential backoff)
- 전체 실패 시 기존 캐시 데이터 유지 (lastSyncedAt 갱신하지 않음)
- 쿼터 소진 시 다음 cron까지 대기

## API Design

### 인증

모든 요청에 `X-API-Key` 헤더 필요.

부트스트랩: 시드 스크립트에서 초기 유저 + API Key 생성. `.env`에 `SEED_API_KEY` 설정.

### 식당 매칭 규칙

API에서 식당명으로 매칭 시:
- **유사도 검색** — 정확히 일치하지 않아도 가장 가까운 이름 매칭 (예: "만선" → "만선짬뽕")
- 동일 이름의 식당이 여러 개일 경우 **가장 가까운 곳** (유저 직장 기준) 선택
- 매칭 실패 시 400 에러

### Endpoints

#### Recommendations (추천)

```
GET /recommendations          오늘의 추천
      ?category=한식          카테고리 필터 (선택)
      ?priceRange=중가        가격대 필터 (선택)
      ?unvisited=true         안 가본 곳만 (선택)
      ?count=3                추천 개수 (기본 3)
```

**응답 — 1순위 강추(pick) + 대안(alternatives):**
```json
{
  "pick": {
    "id": 101,
    "restaurantId": 42,
    "restaurant": {
      "name": "만선짬뽕",
      "category": "중식",
      "address": "강남구 역삼동 123-4",
      "distance": "도보 7분",
      "combinedRating": 4.3,
      "menus": [
        { "name": "짬뽕", "price": 8000 },
        { "name": "탕수육", "price": 15000 },
        { "name": "볶음밥", "price": 8000 }
      ]
    },
    "reason": "평점 높고 최근 2주간 방문 없음",
    "score": 8.7
  },
  "alternatives": [
    {
      "id": 102,
      "restaurantId": 55,
      "restaurant": {
        "name": "미소라멘",
        "category": "일식",
        "address": "강남구 역삼동 456-7",
        "distance": "도보 5분",
        "combinedRating": 4.5,
        "menus": [
          { "name": "돈코츠라멘", "price": 10000 }
        ]
      },
      "reason": "아직 안 가본 곳, 네이버 평점 4.5",
      "score": 8.2
    },
    {
      "id": 103,
      "restaurantId": 18,
      "restaurant": {
        "name": "김밥천국 역삼점",
        "category": "한식",
        "address": "강남구 역삼동 789-0",
        "distance": "도보 3분",
        "combinedRating": 3.8,
        "menus": [
          { "name": "김치찌개", "price": 7000 }
        ]
      },
      "reason": "가성비 좋고 빠름",
      "score": 7.8
    }
  ],
  "recommendedAt": "2026-03-17T11:00:00Z"
}
```

메뉴 개수: pick 최대 3개, alternatives 최대 1개 (인지 부하 감소).

추천 응답의 `id`는 Recommendation 레코드 ID. 방문 기록 시 `recommendationId`로 연결.

#### Visits (방문 기록)

```
POST   /visits                방문 기록 생성 (식당명 기반)
GET    /visits                방문 목록
         ?period=week|month   기간 필터 (week=최근 7일, month=최근 30일)
         ?category=중식       카테고리 필터
         ?restaurant=만선      식당명 검색 (부분 일치)
         ?rating=GOOD         평가 필터
         ?limit=20
         ?cursor=42           커서 페이지네이션 (마지막 visit id)
GET    /visits/:id            방문 상세
PATCH  /visits/:id            피드백 추가/수정
DELETE /visits/:id            방문 삭제
```

**POST /visits 요청 (이름 기반):**
```json
{
  "restaurant": "만선짬뽕",
  "recommendationId": 101,
  "rating": "GOOD",
  "menu": "짬뽕",
  "comment": "국물이 시원해",
  "visitedAt": "2026-03-17"
}
```

- `restaurant`: 필수. 식당명 매칭.
- `recommendationId`: 선택. 추천에서 선택한 경우 전달 → 해당 Recommendation의 `chosen`을 `true`로 업데이트.
- `rating`, `menu`, `comment`: 모두 선택.
- `visitedAt`: 선택. 기본값 오늘. 어제 점심 등 소급 기록 가능.

**POST /visits 응답 (201):**
```json
{
  "id": 1,
  "restaurant": "만선짬뽕",
  "category": "중식",
  "rating": "GOOD",
  "menu": "짬뽕",
  "comment": "국물이 시원해",
  "visitedAt": "2026-03-17",
  "missingOptional": []
}
```

**GET /visits/:id 응답:**
```json
{
  "id": 1,
  "restaurant": "만선짬뽕",
  "category": "중식",
  "rating": "GOOD",
  "menu": "짬뽕",
  "comment": "국물이 시원해",
  "visitedAt": "2026-03-17"
}
```

**PATCH /visits/:id 요청:**
```json
{
  "rating": "AMAZING",
  "menu": "짬뽕",
  "comment": "역대급이었어"
}
```

보낸 필드만 업데이트, 나머지 유지.

**GET /visits 응답:**
```json
{
  "data": [
    {
      "id": 1,
      "restaurant": "만선짬뽕",
      "category": "중식",
      "rating": "GOOD",
      "menu": "짬뽕",
      "comment": "국물이 시원해",
      "visitedAt": "2026-03-17"
    }
  ],
  "nextCursor": 42
}
```

`nextCursor`가 `null`이면 마지막 페이지.

#### Settings (유저 설정)

```
GET    /settings              현재 설정 조회
PATCH  /settings              설정 변경 (partial update)
```

**GET /settings 응답:**
```json
{
  "latitude": 37.5012,
  "longitude": 127.0396,
  "walkMinutes": 10,
  "minRating": 3.5,
  "excludeDays": 5
}
```

#### Restaurants (식당 조회)

```
GET /restaurants              수집된 식당 목록
      ?category=한식
      ?name=만선
      ?limit=20
      ?cursor=42
GET /restaurants/:id          식당 상세
```

**GET /restaurants 응답:**
```json
{
  "data": [
    {
      "id": 42,
      "name": "만선짬뽕",
      "category": "중식",
      "address": "강남구 역삼동 123-4",
      "distance": "도보 7분",
      "combinedRating": 4.3,
      "topMenu": { "name": "짬뽕", "price": 8000 }
    }
  ],
  "nextCursor": 42
}
```

**GET /restaurants/:id 응답:**
```json
{
  "id": 42,
  "name": "만선짬뽕",
  "category": "중식",
  "address": "강남구 역삼동 123-4",
  "distance": "도보 7분",
  "combinedRating": 4.3,
  "kakaoRating": 4.2,
  "naverRating": 4.4,
  "naverBlogCount": 89,
  "businessHours": { "mon": "11:00-21:00", "tue": "11:00-21:00" },
  "menus": [
    { "name": "짬뽕", "price": 8000 },
    { "name": "탕수육", "price": 15000 },
    { "name": "볶음밥", "price": 8000 }
  ],
  "myVisits": [
    { "id": 1, "rating": "GOOD", "menu": "짬뽕", "visitedAt": "2026-03-17" }
  ]
}
```

#### Stats (통계)

```
GET /stats/summary            종합 통계
```

**응답:**
```json
{
  "totalVisits": 45,
  "thisMonthVisits": 12,
  "uniqueRestaurants": 28,
  "favoriteCategory": "한식",
  "favoriteRestaurant": "만선짬뽕",
  "ratingDistribution": { "AMAZING": 5, "GOOD": 25, "OKAY": 10, "BAD": 3, "NEVER": 2 }
}
```

### 에러 응답

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Restaurant not found: 만선짬뽕2"
}
```

| 상황 | HTTP Status | message 예시 |
|------|-------------|-------------|
| API Key 없음/불일치 | 401 | "Invalid API key" |
| 리소스 없음 | 404 | "Visit not found" |
| 식당 매칭 실패 | 400 | "Restaurant not found: 만선짬뽕2" |
| 설정 미완료 (위치 없음) | 400 | "Location not set. Update settings first" |
| 유효성 검증 실패 | 400 | "walkMinutes must be between 1 and 30" |
| 추천 결과 없음 | 200 | pick: null, message 포함 |

## OpenClaw Workspace Skill

### 도구 정의

```yaml
tools:
  - name: get_recommendations
    description: "점심 식당 추천. 카테고리/가격대/안가본곳 필터 가능"
    method: GET /recommendations

  - name: create_visit
    description: "방문 기록 생성. 식당명 + 선택적 평가/메뉴/한줄평"
    method: POST /visits

  - name: update_visit
    description: "방문 기록에 피드백 추가/수정"
    method: PATCH /visits/:id

  - name: delete_visit
    description: "방문 기록 삭제"
    method: DELETE /visits/:id

  - name: get_visits
    description: "방문 기록 목록. 기간/카테고리/식당명 필터"
    method: GET /visits

  - name: get_restaurant
    description: "식당 상세 정보 (메뉴, 내 방문 이력)"
    method: GET /restaurants/:id

  - name: get_restaurants
    description: "수집된 식당 목록 검색"
    method: GET /restaurants

  - name: get_stats
    description: "점심 통계 (총 방문, 선호 카테고리 등)"
    method: GET /stats/summary

  - name: get_settings
    description: "현재 설정 조회"
    method: GET /settings

  - name: update_settings
    description: "설정 변경 (거리, 평점 기준, 배제 일수 등)"
    method: PATCH /settings
```

### Skill 프롬프트 (행동 지침)

```markdown
# More Munch Skill

직장인의 점심 고민을 해결하는 도우미.

## 추천 시 (매일 cron 또는 유저 요청)
1. get_recommendations 호출
2. pick(1순위)을 강하게 밀어준다
   - "오늘은 만선짬뽕 어때? 짬뽕(8,000원)이 인기야!"
   - 메뉴는 pick 3개, alternatives 1개만 언급
3. 유저가 거부하면 alternatives 제시
   - "그러면 미소라멘은? 돈코츠라멘이 맛있대"
4. 유저가 "오늘 면 땡겨" 등 힌트를 주면 category 필터로 재추천
5. 추천 결과가 없으면 설정 조정을 제안

## 피드백 수집 (매일 cron 또는 유저 요청)
1. "점심 어디 갔어? 어땠어?" 로 자연스럽게 묻기
2. 식당명 + 평가(최고/좋았다/보통/별로/다시는안가)만 받으면 완료
3. 추천한 곳에 갔으면 recommendationId를 함께 전송
4. 응답의 missingOptional 확인, 메뉴/한줄평은 가볍게 물어보되 강요하지 않음
5. "패스", "바빠" 하면 즉시 멈춤

## 질문 수신 시
- "이번 달 뭐 먹었지?" → get_visits (period=month)
- "안 가본 데 추천해줘" → get_recommendations (unvisited=true)
- "만선짬뽕 어때?" → get_restaurant
- "통계 보여줘" → get_stats
- "도보 15분으로 바꿔줘" → update_settings

## 온보딩 (최초 1회)
"점심 추천 서비스 연동 완료! 기본 설정:
 - 도보 10분 이내, 평점 3.5 이상
 - 최근 5일 방문한 곳 제외
 - 카테고리 골고루 추천
 변경하고 싶으면 언제든 말해줘!"

## 원칙
- 1순위를 확신 있게 밀어준다. 우유부단하지 않게.
- 간결하게. 메뉴/가격 핵심만.
- 유저가 바쁘면 최소 정보만으로 빠르게 마무리.
```

## Deployment

OpenClaw과 같은 미니PC에서 운영.

```
k3s 클러스터 (미니PC)
├─ more-munch-server (Deployment)
│   └─ NestJS 컨테이너 (포트 19848)
│       ├─ API 서버
│       └─ Collector cron (내장, @nestjs/schedule)
│           ├─ 매일 04:00 — 기존 식당 데이터 갱신
│           └─ 매주 일 04:00 — 전체 재스캔
│       └─ SQLite DB → /data/more-munch.db
└─ (선택) cloudflare-tunnel
```

- **Dockerfile** — NestJS 멀티스테이지 빌드
- **k8s manifests** — Deployment, Service, PV (SQLite 파일용), Secret
- **포트** — 19848
- **Cloudflare Tunnel** — 선택. 같은 호스트면 localhost:19848

### 환경변수

- `DATABASE_URL` — SQLite 파일 경로 (예: `file:./data/more-munch.db`)
- `SEED_API_KEY` — 초기 유저 API Key
- `KAKAO_REST_API_KEY` — 카카오 Places API
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` — 네이버 검색 API

## Bootstrapping

1. `pnpm prisma migrate deploy` — SQLite 마이그레이션
2. `pnpm seed` — 시드 스크립트 (초기 유저 + API Key 생성)
3. `.env` 설정 (`SEED_API_KEY`, 카카오/네이버 API 키)
4. 유저가 Skill 온보딩 시 `PATCH /settings`으로 직장 위치 설정
5. 위치 설정 후 첫 Collector 수집 트리거 → 추천 시작

## Testing Strategy

- **Unit tests** — 추천 점수 계산, 식당 매칭, 거리 계산, 통계 집계
- **Integration tests** — API 엔드포인트 E2E (supertest)
- **Collector tests** — 외부 API 응답 파싱, 데이터 병합 로직, 체험단 필터링 (mock)
- **DB tests** — Prisma 쿼리 검증 (test DB)

## Future Expansion

- 다중 유저 지원 (팀/동료 기능, "우리 팀 아무도 안 가본 곳")
- 메뉴 수준 추천 ("거기 가면 짬뽕 추천")
- 날씨/맥락 연동 (비 오면 국물 가중치 상승)
- 가중치 기반 추천 알고리즘 (D 모드)
- 예약 연동 (네이버 예약 등)
- 외부 도보 경로 API로 거리 정확도 개선
