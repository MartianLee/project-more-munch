# More Munch

직장인을 위한 점심 추천 서비스. 주변 식당을 자동 수집하고, 방문 기록과 평점을 기반으로 매일 새로운 점심 메뉴를 추천합니다.

## 주요 기능

- **식당 자동 수집** — 카카오/네이버 API로 주변 식당 데이터를 수집하고 병합
- **개인화 추천** — 방문 이력, 평점, 거리, 최근 방문일을 종합한 추천 알고리즘
- **방문 기록** — 식당별 방문 기록 및 5단계 평점 (AMAZING ~ NEVER)
- **관리자 대시보드** — 식당/방문/통계를 한눈에 확인하는 웹 UI
- **OpenClaw 연동** — AI 비서를 통한 자연어 기반 점심 추천

## 기술 스택

| 영역 | 기술 |
|------|------|
| 서버 | NestJS 11, TypeScript, Node.js 22 |
| DB | SQLite + Prisma 7 (LibSQL adapter) |
| 외부 API | 카카오 Local API, 네이버 검색 API |
| 관리자 UI | EJS + HTMX + DaisyUI |
| API 문서 | Swagger (OpenAPI) |
| 배포 | Docker Compose |

## 빠른 시작 (Docker)

```bash
git clone https://github.com/MartianLee/project-more-munch.git
cd project-more-munch
cp .env.example .env   # API 키 입력
docker compose up -d
```

접속:
- API 문서: http://localhost:19848/docs
- 관리자: http://localhost:19848/admin

초기 사용자 시딩:
```bash
docker compose exec more-munch npx tsx prisma/seed.ts
```

## 로컬 개발

```bash
cd apps/server
pnpm install
npx prisma migrate deploy
pnpm seed          # 초기 데이터 생성
pnpm start:dev     # http://localhost:19848
```

## 환경 변수

`.env.example`을 `.env`로 복사한 후 값을 채워주세요.

| 변수 | 설명 | 발급처 |
|------|------|--------|
| `KAKAO_REST_API_KEY` | 카카오 REST API 키 | [developers.kakao.com](https://developers.kakao.com) |
| `NAVER_CLIENT_ID` | 네이버 검색 API Client ID | [developers.naver.com](https://developers.naver.com) |
| `NAVER_CLIENT_SECRET` | 네이버 검색 API Secret | 위와 동일 |
| `SEED_API_KEY` | 사용자 인증용 API 키 | 임의 문자열 |
| `SESSION_SECRET` | 관리자 세션 시크릿 | 임의 문자열 |

## API 개요

모든 API는 `X-API-Key` 헤더로 인증합니다.

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /recommendations` | 오늘의 점심 추천 |
| `GET /restaurants` | 식당 목록 (카테고리, 이름, 페이지네이션) |
| `GET /restaurants/:id` | 식당 상세 (거리 포함) |
| `PATCH /settings` | 위치, 도보 시간, 최소 평점 등 설정 |
| `POST /visits` | 방문 기록 등록 |
| `GET /visits` | 방문 이력 조회 |
| `GET /stats/summary` | 통계 요약 |
| `POST /collector/run` | 식당 데이터 수동 수집 (H3 그리드 기반) |

자세한 API 명세는 `/docs` (Swagger UI)에서 확인할 수 있습니다.

### 식당 수집 방식

[H3 Hexagonal Grid](https://h3geo.org/)를 사용하여 검색 영역을 육각형 셀로 분할합니다. 카카오 API의 좌표당 45개 제한을 우회하여 **수백 개의 식당**을 수집할 수 있습니다.

- 해상도 8 셀로 주변 영역을 분할 → 각 셀 중심점마다 카카오 검색
- 결과가 45개(포화)인 셀은 해상도 9로 세분화하여 재검색
- `kakaoId` 기준 자동 중복 제거

```bash
# 수집 실행 예시
curl -X POST http://localhost:19848/collector/run -H "X-API-Key: <your-key>"
# → { "totalRestaurants": 395, "cellsSearched": 56, "saturatedCells": 7 }
```

## OpenClaw 연동 가이드

[OpenClaw](https://openclaw.io)는 AI 비서 플랫폼입니다. More Munch를 OpenClaw에 연결하면 대화로 점심 추천을 받을 수 있습니다.

### 1단계: 서버 실행 확인

먼저 More Munch 서버가 실행 중이어야 합니다. 위의 [빠른 시작](#빠른-시작-docker) 또는 [로컬 개발](#로컬-개발)을 완료하세요.

서버가 잘 실행되는지 확인:
```bash
# 브라우저에서 아래 주소로 접속해 보세요
http://localhost:19848/docs
# Swagger 페이지가 보이면 성공!
```

### 2단계: API 키 확인

OpenClaw에서 More Munch API를 호출할 때 인증이 필요합니다. `.env` 파일에 설정한 `SEED_API_KEY` 값을 메모해 두세요.

```bash
# .env 파일에서 확인
cat .env | grep SEED_API_KEY
# 예: SEED_API_KEY=dcdb743e595c91c7910643230f2ea45c
```

### 3단계: OpenClaw에 스킬 등록

OpenClaw 스킬은 파일 기반입니다. 워크스페이스의 `skills/` 폴더에 파일을 만들면 자동으로 인식됩니다.

```bash
# OpenClaw 워크스페이스의 skills 폴더에 디렉토리 생성
mkdir -p <openclaw-workspace>/skills/more-munch

# 이 프로젝트의 스킬 파일을 복사
cp skill/more-munch-skill.md <openclaw-workspace>/skills/more-munch/SKILL.md
```

> `<openclaw-workspace>`는 OpenClaw이 실행되는 워크스페이스 경로입니다.
> 전역으로 등록하려면 `~/.openclaw/skills/more-munch/SKILL.md`에 넣어도 됩니다.

### 4단계: API 키 설정

`~/.openclaw/openclaw.json` 파일을 열어서 More Munch 스킬의 환경 변수를 등록합니다:

```json
{
  "skills": {
    "entries": {
      "more-munch": {
        "enabled": true,
        "env": {
          "MORE_MUNCH_API_URL": "http://localhost:19848",
          "MORE_MUNCH_API_KEY": "2단계에서 확인한 SEED_API_KEY 값"
        }
      }
    }
  }
}
```

> - 같은 컴퓨터에서 실행 중이면: `http://localhost:19848`
> - 다른 기기에서 접속하려면: `http://<맥미니IP>:19848`
>   (맥미니 IP 확인: `ifconfig | grep "inet " | grep -v 127.0.0.1`)

### 5단계: 초기 설정

OpenClaw에서 새 세션을 시작하면 스킬이 자동 로드됩니다. 대화를 시작해 보세요:

```
나: "위치를 시청역으로 설정해줘"
AI: 설정 완료! 도보 10분 이내, 평점 3.5 이상 식당을 추천할게요.

나: "주변 식당 수집해줘"
AI: 수집 완료! 45개 식당을 찾았어요.

나: "오늘 점심 뭐 먹지?"
AI: 오늘은 만선짬뽕 어때? 짬뽕(8,000원)이 인기야!
```

### 사용 예시

| 말하기 | 동작 |
|--------|------|
| "점심 추천해줘" | 맞춤 식당 추천 |
| "안 가본 데 추천해줘" | 미방문 식당만 추천 |
| "오늘 면 땡겨" | 면 카테고리 필터 추천 |
| "오늘 만선짬뽕 갔어, 맛있었어" | 방문 기록 저장 (평점: GOOD) |
| "이번 달 뭐 먹었지?" | 방문 이력 조회 |
| "도보 15분으로 바꿔줘" | 설정 변경 |
| "통계 보여줘" | 방문 통계 조회 |

## 프로젝트 구조

```
apps/server/
├── src/
│   ├── admin/           # 관리자 대시보드
│   ├── collector/       # 식당 데이터 수집 (카카오/네이버)
│   ├── recommendation/  # 추천 알고리즘
│   ├── restaurant/      # 식당 검색/관리
│   ├── settings/        # 사용자 설정
│   ├── stats/           # 통계
│   ├── visit/           # 방문 기록
│   └── prisma/          # DB 서비스
├── prisma/              # 스키마 & 마이그레이션
├── views/               # EJS 템플릿 (관리자 UI)
└── public/              # 정적 파일
```

## 라이선스

ISC
