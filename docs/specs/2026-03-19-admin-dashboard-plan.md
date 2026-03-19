# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NestJS 서버에 EJS + HTMX + DaisyUI 기반 경량 관리자 대시보드 내장

**Architecture:** NestJS의 MVC 기능으로 EJS 템플릿을 서버 사이드 렌더링. HTMX로 부분 업데이트 처리. 기존 서비스 레이어를 그대로 재활용하고, AdminController가 HTML 응답을 반환하는 구조.

**Tech Stack:** NestJS, EJS, HTMX (CDN), Tailwind CSS + DaisyUI (CDN), express-session

**Spec:** `docs/specs/2026-03-19-admin-dashboard-design.md`

---

## File Structure

```
apps/server/
├── src/admin/
│   ├── admin.module.ts          ← 모듈 등록
│   ├── admin.controller.ts      ← 페이지 렌더링 + HTMX 엔드포인트
│   └── admin.guard.ts           ← 세션 인증 가드
├── views/
│   ├── layouts/admin.ejs        ← 공통 레이아웃 (사이드바, CDN, head)
│   ├── admin/
│   │   ├── login.ejs
│   │   ├── dashboard.ejs
│   │   ├── restaurants.ejs
│   │   ├── visits.ejs
│   │   ├── stats.ejs
│   │   └── settings.ejs
│   └── partials/
│       ├── restaurant-table.ejs ← HTMX 부분 업데이트용
│       ├── restaurant-detail.ejs← 모달 콘텐츠
│       └── visit-table.ejs
├── src/main.ts                  ← EJS 엔진 + 세션 + static 설정 추가
└── src/app.module.ts            ← AdminModule import 추가
```

---

### Task 1: 의존성 설치 & NestJS 템플릿 엔진 설정

**Files:**
- Modify: `apps/server/package.json`
- Modify: `apps/server/src/main.ts`
- Modify: `apps/server/nest-cli.json`
- Create: `apps/server/views/layouts/admin.ejs`

- [ ] **Step 1: 의존성 설치**

```bash
cd apps/server
pnpm add ejs express-session
pnpm add -D @types/express-session
```

- [ ] **Step 2: main.ts에 EJS 엔진 + 세션 + 정적 파일 설정**

`src/main.ts`를 수정:

```typescript
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import * as session from 'express-session';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // EJS 템플릿 엔진
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('ejs');

  // 세션
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'more-munch-admin-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24시간
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('More Munch API')
    .setDescription('Lunch recommendation service for office workers')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(19848);
}
bootstrap();
```

- [ ] **Step 3: nest-cli.json에 views 복사 설정 추가**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "assets": [{ "include": "../views/**/*", "outDir": "dist/views", "watchAssets": true }]
  }
}
```

참고: EJS는 `views/` 디렉토리에서 직접 읽으므로 `setBaseViewsDir`에서 `join(__dirname, '..', 'views')`로 지정. dist 밖의 views를 참조하는 구조. nest-cli의 assets는 production 빌드 시 복사용.

- [ ] **Step 4: 공통 레이아웃 생성**

`views/layouts/admin.ejs`:

```html
<!DOCTYPE html>
<html lang="ko" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title %> - More Munch Admin</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4/dist/full.min.css" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2"></script>
</head>
<body>
  <div class="drawer lg:drawer-open">
    <input id="drawer" type="checkbox" class="drawer-toggle">
    <div class="drawer-content flex flex-col">
      <!-- 모바일 네비 바 -->
      <div class="navbar bg-base-100 lg:hidden">
        <label for="drawer" class="btn btn-square btn-ghost">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </label>
        <span class="text-lg font-bold ml-2">More Munch</span>
      </div>
      <!-- 메인 콘텐츠 -->
      <main class="p-6">
        <%- body %>
      </main>
    </div>
    <!-- 사이드바 -->
    <div class="drawer-side">
      <label for="drawer" class="drawer-overlay"></label>
      <ul class="menu bg-base-200 text-base-content min-h-full w-60 p-4">
        <li class="mb-4"><span class="text-xl font-bold">More Munch</span></li>
        <li><a href="/admin" class="<%= currentPath === '/admin' ? 'active' : '' %>">대시보드</a></li>
        <li><a href="/admin/restaurants" class="<%= currentPath.startsWith('/admin/restaurants') ? 'active' : '' %>">식당 관리</a></li>
        <li><a href="/admin/visits" class="<%= currentPath.startsWith('/admin/visits') ? 'active' : '' %>">방문 기록</a></li>
        <li><a href="/admin/stats" class="<%= currentPath === '/admin/stats' ? 'active' : '' %>">통계</a></li>
        <li><a href="/admin/settings" class="<%= currentPath === '/admin/settings' ? 'active' : '' %>">설정 & 수집</a></li>
        <li class="mt-auto"><a href="/admin/logout">로그아웃</a></li>
      </ul>
    </div>
  </div>
  <!-- 모달 컨테이너 -->
  <div id="modal-container"></div>
</body>
</html>
```

- [ ] **Step 5: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공, 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/main.ts nest-cli.json package.json pnpm-lock.yaml views/
git commit -m "feat(admin): configure EJS template engine, session, layout"
```

---

### Task 2: AdminModule + 인증 (로그인/세션 가드)

**Files:**
- Create: `apps/server/src/admin/admin.module.ts`
- Create: `apps/server/src/admin/admin.guard.ts`
- Create: `apps/server/src/admin/admin.controller.ts` (로그인만 우선)
- Modify: `apps/server/src/app.module.ts`
- Create: `apps/server/views/admin/login.ejs`

- [ ] **Step 1: 세션 인증 가드 생성**

`src/admin/admin.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (request.session?.userId) {
      return true;
    }
    const response = context.switchToHttp().getResponse();
    response.redirect('/admin/login');
    return false;
  }
}
```

- [ ] **Step 2: 로그인 페이지 생성**

`views/admin/login.ejs`:

```html
<!DOCTYPE html>
<html lang="ko" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>로그인 - More Munch Admin</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4/dist/full.min.css" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen flex items-center justify-center bg-base-200">
  <div class="card w-96 bg-base-100 shadow-xl">
    <div class="card-body">
      <h2 class="card-title justify-center text-2xl mb-4">More Munch Admin</h2>
      <% if (typeof error !== 'undefined' && error) { %>
        <div class="alert alert-error mb-4"><span><%= error %></span></div>
      <% } %>
      <form method="POST" action="/admin/login">
        <div class="form-control">
          <label class="label"><span class="label-text">API Key</span></label>
          <input type="password" name="apiKey" placeholder="API Key 입력" class="input input-bordered" required>
        </div>
        <div class="form-control mt-6">
          <button type="submit" class="btn btn-primary">로그인</button>
        </div>
      </form>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 3: AdminController (로그인/로그아웃) 생성**

`src/admin/admin.controller.ts`:

```typescript
import { Controller, Get, Post, Req, Res, UseGuards, Body } from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';

@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('login')
  loginPage(@Req() req: Request, @Res() res: Response) {
    if ((req.session as any)?.userId) {
      return res.redirect('/admin');
    }
    res.render('admin/login', { error: null });
  }

  @Post('login')
  async login(
    @Body('apiKey') apiKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = await this.prisma.user.findUnique({ where: { apiKey } });
    if (!user) {
      return res.render('admin/login', { error: 'API Key가 올바르지 않습니다.' });
    }
    (req.session as any).userId = user.id;
    (req.session as any).nickname = user.nickname;
    res.redirect('/admin');
  }

  @Get('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => {
      res.redirect('/admin/login');
    });
  }
}
```

- [ ] **Step 4: AdminModule 생성**

`src/admin/admin.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';

@Module({
  controllers: [AdminController],
})
export class AdminModule {}
```

- [ ] **Step 5: AppModule에 AdminModule 등록**

`src/app.module.ts`의 imports 배열에 AdminModule 추가:

```typescript
import { AdminModule } from './admin/admin.module';
// ...
imports: [
  // ...기존 모듈들,
  AdminModule,
],
```

- [ ] **Step 6: 빌드 및 로그인 수동 테스트**

```bash
npm run build
```

서버 실행 후 `http://localhost:19848/admin/login` 접속, API Key로 로그인 확인.

- [ ] **Step 7: 커밋**

```bash
git add src/admin/ src/app.module.ts views/admin/login.ejs
git commit -m "feat(admin): add login, session guard, admin module"
```

---

### Task 3: 대시보드 페이지

**Files:**
- Modify: `apps/server/src/admin/admin.controller.ts`
- Create: `apps/server/views/admin/dashboard.ejs`

- [ ] **Step 1: AdminController에 대시보드 라우트 추가**

`admin.controller.ts`에 추가:

```typescript
@Get()
@UseGuards(AdminGuard)
async dashboard(@Req() req: Request, @Res() res: Response) {
  const userId = (req.session as any).userId;

  const [restaurantCount, weekVisitCount, lastRestaurant, recentRecommendations, recentVisits] =
    await Promise.all([
      this.prisma.restaurant.count({ where: { isActive: true } }),
      this.prisma.visit.count({
        where: {
          userId,
          visitedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.restaurant.findFirst({ orderBy: { lastSyncedAt: 'desc' }, select: { lastSyncedAt: true } }),
      this.prisma.recommendation.findMany({
        where: { userId },
        orderBy: { recommendedAt: 'desc' },
        take: 5,
        include: { restaurant: { select: { name: true } } },
      }),
      this.prisma.visit.findMany({
        where: { userId },
        orderBy: { visitedAt: 'desc' },
        take: 5,
        include: { restaurant: { select: { name: true } } },
      }),
    ]);

  res.render('admin/dashboard', {
    layout: 'layouts/admin',
    title: '대시보드',
    currentPath: '/admin',
    restaurantCount,
    weekVisitCount,
    lastSyncedAt: lastRestaurant?.lastSyncedAt,
    recentRecommendations,
    recentVisits,
  });
}
```

- [ ] **Step 2: dashboard.ejs 생성**

`views/admin/dashboard.ejs`:

```html
<%- include('../layouts/admin', { body: `
<h1 class="text-2xl font-bold mb-6">대시보드</h1>

<!-- 요약 카드 -->
<div class="stats shadow w-full mb-8">
  <div class="stat">
    <div class="stat-title">총 식당 수</div>
    <div class="stat-value">${restaurantCount}</div>
    <div class="stat-desc">활성 식당</div>
  </div>
  <div class="stat">
    <div class="stat-title">이번 주 방문</div>
    <div class="stat-value">${weekVisitCount}</div>
    <div class="stat-desc">최근 7일</div>
  </div>
  <div class="stat">
    <div class="stat-title">마지막 수집</div>
    <div class="stat-value text-lg">${lastSyncedAt ? new Date(lastSyncedAt).toLocaleDateString('ko') : '-'}</div>
  </div>
</div>
` }) %>
```

참고: EJS에서 layout include 패턴이 복잡하므로, 실제 구현 시 `ejs-mate` 또는 간단한 include 방식으로 조정 가능. 핵심은 레이아웃 래핑 + 동적 데이터 바인딩.

실제로는 아래 구조로 각 페이지를 렌더링:

`views/admin/dashboard.ejs` (body 부분만):

```html
<h1 class="text-2xl font-bold mb-6">대시보드</h1>

<div class="stats shadow w-full mb-8">
  <div class="stat">
    <div class="stat-title">총 식당 수</div>
    <div class="stat-value"><%= restaurantCount %></div>
    <div class="stat-desc">활성 식당</div>
  </div>
  <div class="stat">
    <div class="stat-title">이번 주 방문</div>
    <div class="stat-value"><%= weekVisitCount %></div>
    <div class="stat-desc">최근 7일</div>
  </div>
  <div class="stat">
    <div class="stat-title">마지막 수집</div>
    <div class="stat-value text-lg"><%= lastSyncedAt ? new Date(lastSyncedAt).toLocaleDateString('ko') : '-' %></div>
  </div>
</div>

<!-- 최근 추천 -->
<h2 class="text-lg font-semibold mb-3">최근 추천</h2>
<div class="overflow-x-auto mb-8">
  <table class="table table-zebra">
    <thead><tr><th>식당명</th><th>점수</th><th>추천일</th></tr></thead>
    <tbody>
      <% recentRecommendations.forEach(r => { %>
      <tr>
        <td><%= r.restaurant.name %></td>
        <td><%= r.score.toFixed(1) %></td>
        <td><%= new Date(r.recommendedAt).toLocaleDateString('ko') %></td>
      </tr>
      <% }) %>
      <% if (recentRecommendations.length === 0) { %>
      <tr><td colspan="3" class="text-center text-gray-400">추천 이력이 없습니다</td></tr>
      <% } %>
    </tbody>
  </table>
</div>

<!-- 최근 방문 -->
<h2 class="text-lg font-semibold mb-3">최근 방문</h2>
<div class="overflow-x-auto">
  <table class="table table-zebra">
    <thead><tr><th>식당명</th><th>평점</th><th>날짜</th></tr></thead>
    <tbody>
      <% recentVisits.forEach(v => { %>
      <tr>
        <td><%= v.restaurant.name %></td>
        <td><%= v.rating || '-' %></td>
        <td><%= new Date(v.visitedAt).toLocaleDateString('ko') %></td>
      </tr>
      <% }) %>
      <% if (recentVisits.length === 0) { %>
      <tr><td colspan="3" class="text-center text-gray-400">방문 기록이 없습니다</td></tr>
      <% } %>
    </tbody>
  </table>
</div>
```

컨트롤러에서 `res.render('admin/dashboard', data)` 호출 시, EJS가 이 파일을 렌더링. 레이아웃 래핑은 컨트롤러에서 레이아웃 변수를 전달하고 dashboard.ejs가 `<%- include('../layouts/admin') %>`로 감싸는 방식 사용.

- [ ] **Step 3: 빌드 및 수동 테스트**

```bash
npm run build
```

로그인 후 `/admin` 접속, 대시보드 카드와 테이블 표시 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/admin/admin.controller.ts views/admin/dashboard.ejs
git commit -m "feat(admin): add dashboard page with summary cards"
```

---

### Task 4: 식당 관리 페이지 (목록 + 검색/필터)

**Files:**
- Modify: `apps/server/src/admin/admin.controller.ts`
- Create: `apps/server/views/admin/restaurants.ejs`
- Create: `apps/server/views/partials/restaurant-table.ejs`

- [ ] **Step 1: 식당 목록 라우트 추가**

`admin.controller.ts`에 추가:

```typescript
@Get('restaurants')
@UseGuards(AdminGuard)
async restaurants(
  @Req() req: Request,
  @Res() res: Response,
) {
  const { search, category, active, cursor } = req.query as any;

  const where: any = {};
  if (search) where.name = { contains: search };
  if (category) where.category = category;
  if (active === 'true') where.isActive = true;
  else if (active === 'false') where.isActive = false;

  const take = 20;
  const restaurants = await this.prisma.restaurant.findMany({
    where,
    take: take + 1,
    ...(cursor ? { cursor: { id: parseInt(cursor) }, skip: 1 } : {}),
    orderBy: { name: 'asc' },
    include: { _count: { select: { menus: true } } },
  });

  const hasMore = restaurants.length > take;
  const items = hasMore ? restaurants.slice(0, take) : restaurants;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  const categories = await this.prisma.restaurant.findMany({
    distinct: ['category'],
    where: { category: { not: null } },
    select: { category: true },
  });

  const data = {
    restaurants: items,
    nextCursor,
    categories: categories.map(c => c.category).filter(Boolean),
    filters: { search, category, active },
    title: '식당 관리',
    currentPath: '/admin/restaurants',
  };

  // HTMX 부분 업데이트 요청이면 partial만 반환
  if (req.headers['hx-request']) {
    return res.render('partials/restaurant-table', data);
  }
  res.render('admin/restaurants', data);
}
```

- [ ] **Step 2: restaurants.ejs 생성**

`views/admin/restaurants.ejs` — 검색/필터 바 + 테이블. 검색/필터 입력 시 HTMX가 `GET /admin/restaurants?search=...`로 요청하고 테이블 부분만 교체.

- [ ] **Step 3: restaurant-table.ejs partial 생성**

`views/partials/restaurant-table.ejs` — 테이블 tbody + 페이지네이션. HTMX 부분 업데이트 시 이 파일만 반환.

- [ ] **Step 4: 빌드 및 수동 테스트**

```bash
npm run build
```

`/admin/restaurants` 접속, 검색/필터 동작 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/admin/admin.controller.ts views/admin/restaurants.ejs views/partials/restaurant-table.ejs
git commit -m "feat(admin): add restaurant list with search and filter"
```

---

### Task 5: 식당 상세/편집 모달 + 메뉴 관리

**Files:**
- Modify: `apps/server/src/admin/admin.controller.ts`
- Create: `apps/server/views/partials/restaurant-detail.ejs`

- [ ] **Step 1: 식당 상세 조회 라우트 (모달용)**

`admin.controller.ts`에 추가:

```typescript
@Get('restaurants/:id')
@UseGuards(AdminGuard)
async restaurantDetail(@Req() req: Request, @Res() res: Response) {
  const id = parseInt(req.params.id);
  const restaurant = await this.prisma.restaurant.findUnique({
    where: { id },
    include: { menus: true },
  });
  if (!restaurant) return res.status(404).send('Not found');
  res.render('partials/restaurant-detail', { restaurant });
}
```

- [ ] **Step 2: 식당 수정 라우트**

```typescript
@Post('restaurants/:id')
@UseGuards(AdminGuard)
async updateRestaurant(@Req() req: Request, @Res() res: Response) {
  const id = parseInt(req.params.id);
  const { name, category, address, isActive } = req.body;
  await this.prisma.restaurant.update({
    where: { id },
    data: { name, category, address, isActive: isActive === 'true' },
  });
  res.set('HX-Trigger', 'restaurant-updated');
  res.render('partials/restaurant-detail', {
    restaurant: await this.prisma.restaurant.findUnique({ where: { id }, include: { menus: true } }),
  });
}
```

- [ ] **Step 3: 메뉴 추가/삭제 라우트**

```typescript
@Post('restaurants/:id/menus')
@UseGuards(AdminGuard)
async addMenu(@Req() req: Request, @Res() res: Response) {
  const restaurantId = parseInt(req.params.id);
  const { name, price } = req.body;
  await this.prisma.menuItem.create({
    data: { restaurantId, name, price: price ? parseInt(price) : null },
  });
  const restaurant = await this.prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: { menus: true },
  });
  res.render('partials/restaurant-detail', { restaurant });
}

@Post('restaurants/:id/menus/:menuId/delete')
@UseGuards(AdminGuard)
async deleteMenu(@Req() req: Request, @Res() res: Response) {
  const restaurantId = parseInt(req.params.id);
  const menuId = parseInt(req.params.menuId);
  await this.prisma.menuItem.delete({ where: { id: menuId } });
  const restaurant = await this.prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: { menus: true },
  });
  res.render('partials/restaurant-detail', { restaurant });
}
```

- [ ] **Step 4: restaurant-detail.ejs 생성**

`views/partials/restaurant-detail.ejs` — DaisyUI 모달 콘텐츠. 식당 정보 편집 폼 + 메뉴 리스트(추가/삭제). HTMX로 폼 제출 시 모달 내용만 교체.

- [ ] **Step 5: restaurants.ejs에 모달 트리거 연결**

테이블 행 클릭 시 `hx-get="/admin/restaurants/{id}"` + `hx-target="#modal-container"` 로 모달 로드.

- [ ] **Step 6: 빌드 및 수동 테스트**

```bash
npm run build
```

식당 클릭 → 모달 → 정보 수정 / 메뉴 추가·삭제 동작 확인.

- [ ] **Step 7: 커밋**

```bash
git add src/admin/admin.controller.ts views/partials/restaurant-detail.ejs views/admin/restaurants.ejs
git commit -m "feat(admin): add restaurant detail modal with menu CRUD"
```

---

### Task 6: 방문 기록 페이지

**Files:**
- Modify: `apps/server/src/admin/admin.controller.ts`
- Create: `apps/server/views/admin/visits.ejs`
- Create: `apps/server/views/partials/visit-table.ejs`

- [ ] **Step 1: 방문 기록 라우트 추가**

`admin.controller.ts`에 추가:

```typescript
@Get('visits')
@UseGuards(AdminGuard)
async visits(@Req() req: Request, @Res() res: Response) {
  const userId = (req.session as any).userId;
  const { period, rating, search, cursor } = req.query as any;

  const where: any = { userId };
  if (period === 'week') where.visitedAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  else if (period === 'month') where.visitedAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  if (rating) where.rating = rating;
  if (search) where.restaurant = { name: { contains: search } };

  const take = 20;
  const visits = await this.prisma.visit.findMany({
    where,
    take: take + 1,
    ...(cursor ? { cursor: { id: parseInt(cursor) }, skip: 1 } : {}),
    orderBy: { visitedAt: 'desc' },
    include: { restaurant: { select: { name: true } } },
  });

  const hasMore = visits.length > take;
  const items = hasMore ? visits.slice(0, take) : visits;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  const data = {
    visits: items,
    nextCursor,
    filters: { period, rating, search },
    title: '방문 기록',
    currentPath: '/admin/visits',
  };

  if (req.headers['hx-request']) {
    return res.render('partials/visit-table', data);
  }
  res.render('admin/visits', data);
}
```

- [ ] **Step 2: visits.ejs + visit-table.ejs 생성**

검색/필터 바 + 테이블 (restaurant-table과 동일 패턴).

- [ ] **Step 3: 빌드 및 수동 테스트**

```bash
npm run build
```

- [ ] **Step 4: 커밋**

```bash
git add src/admin/admin.controller.ts views/admin/visits.ejs views/partials/visit-table.ejs
git commit -m "feat(admin): add visit history page with filters"
```

---

### Task 7: 통계 페이지

**Files:**
- Modify: `apps/server/src/admin/admin.controller.ts`
- Create: `apps/server/views/admin/stats.ejs`

- [ ] **Step 1: 통계 라우트 추가**

`admin.controller.ts`에 추가. 기존 `StatsService.getSummary()`를 활용하되 추가 데이터(카테고리별 비율, TOP 5 식당, 평점 분포) 직접 쿼리.

```typescript
@Get('stats')
@UseGuards(AdminGuard)
async stats(@Req() req: Request, @Res() res: Response) {
  const userId = (req.session as any).userId;

  // 카테고리별 방문 수
  const categoryGroups = await this.prisma.visit.groupBy({
    by: ['restaurantId'],
    where: { userId },
    _count: { id: true },
  });
  const restaurantIds = categoryGroups.map(g => g.restaurantId);
  const restaurants = await this.prisma.restaurant.findMany({
    where: { id: { in: restaurantIds } },
    select: { id: true, name: true, category: true },
  });
  const rMap = new Map(restaurants.map(r => [r.id, r]));

  const categoryCounts = new Map<string, number>();
  const restaurantCounts = new Map<string, number>();
  for (const g of categoryGroups) {
    const r = rMap.get(g.restaurantId);
    if (r?.category) categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + g._count.id);
    if (r) restaurantCounts.set(r.name, (restaurantCounts.get(r.name) ?? 0) + g._count.id);
  }

  const categoryStats = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1]);
  const totalCategoryVisits = categoryStats.reduce((sum, [, c]) => sum + c, 0);

  const topRestaurants = [...restaurantCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 평점 분포
  const ratings = await this.prisma.visit.groupBy({
    by: ['rating'],
    where: { userId, rating: { not: null } },
    _count: { id: true },
  });
  const ratingDist = Object.fromEntries(ratings.map(r => [r.rating!, r._count.id]));
  const totalRated = ratings.reduce((sum, r) => sum + r._count.id, 0);

  res.render('admin/stats', {
    title: '통계',
    currentPath: '/admin/stats',
    categoryStats,
    totalCategoryVisits,
    topRestaurants,
    ratingDist,
    totalRated,
  });
}
```

- [ ] **Step 2: stats.ejs 생성**

카테고리별 progress bar + TOP 5 테이블 + 평점 분포 bar.

- [ ] **Step 3: 빌드 및 수동 테스트**

```bash
npm run build
```

- [ ] **Step 4: 커밋**

```bash
git add src/admin/admin.controller.ts views/admin/stats.ejs
git commit -m "feat(admin): add stats page with category and rating distribution"
```

---

### Task 8: 설정 & 수집 페이지

**Files:**
- Modify: `apps/server/src/admin/admin.controller.ts`
- Create: `apps/server/views/admin/settings.ejs`

- [ ] **Step 1: 설정 조회/수정 + 수집 트리거 라우트**

```typescript
@Get('settings')
@UseGuards(AdminGuard)
async settings(@Req() req: Request, @Res() res: Response) {
  const userId = (req.session as any).userId;
  const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
  const restaurantCount = await this.prisma.restaurant.count({ where: { isActive: true } });
  const inactiveCount = await this.prisma.restaurant.count({ where: { isActive: false } });
  const lastSync = await this.prisma.restaurant.findFirst({
    orderBy: { lastSyncedAt: 'desc' },
    select: { lastSyncedAt: true },
  });

  res.render('admin/settings', {
    title: '설정 & 수집',
    currentPath: '/admin/settings',
    settings,
    restaurantCount,
    inactiveCount,
    lastSyncedAt: lastSync?.lastSyncedAt,
    message: null,
  });
}

@Post('settings')
@UseGuards(AdminGuard)
async updateSettings(@Req() req: Request, @Res() res: Response) {
  const userId = (req.session as any).userId;
  const { latitude, longitude, walkMinutes, minRating, excludeDays } = req.body;
  await this.prisma.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      walkMinutes: parseInt(walkMinutes),
      minRating: parseFloat(minRating),
      excludeDays: parseInt(excludeDays),
    },
    update: {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      walkMinutes: parseInt(walkMinutes),
      minRating: parseFloat(minRating),
      excludeDays: parseInt(excludeDays),
    },
  });

  // HTMX 요청이면 성공 메시지만 반환
  if (req.headers['hx-request']) {
    return res.send('<div class="alert alert-success mb-4"><span>설정이 저장되었습니다.</span></div>');
  }
  res.redirect('/admin/settings');
}
```

수집 트리거는 기존 `POST /collector/run` API를 HTMX에서 직접 호출.

- [ ] **Step 2: settings.ejs 생성**

설정 편집 폼 (HTMX 제출) + 수집 상태 카드 + 수동 수집 버튼.

- [ ] **Step 3: 빌드 및 수동 테스트**

```bash
npm run build
```

- [ ] **Step 4: 커밋**

```bash
git add src/admin/admin.controller.ts views/admin/settings.ejs
git commit -m "feat(admin): add settings and collector management page"
```

---

### Task 9: 레이아웃 통합 및 최종 정리

**Files:**
- Modify: `apps/server/views/layouts/admin.ejs`
- Modify: 모든 페이지 EJS 파일
- Modify: `apps/server/src/admin/admin.controller.ts`

- [ ] **Step 1: EJS include 기반 레이아웃 래핑 확정**

모든 페이지 EJS가 `<%- include('../layouts/admin') %>`를 사용하는 최종 패턴 확정. 또는 컨트롤러 헬퍼로 layout 변수를 자동 주입하는 방식.

- [ ] **Step 2: 전체 페이지 네비게이션 및 스타일 통일**

사이드바 active 상태, 반응형, 모달 닫기 등 최종 확인.

- [ ] **Step 3: 전체 빌드 및 전 페이지 수동 테스트**

```bash
npm run build
```

모든 페이지 순회 테스트: 로그인 → 대시보드 → 식당 → 방문 → 통계 → 설정 → 로그아웃.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(admin): finalize layout integration and navigation"
```
