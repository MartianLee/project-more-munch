# More Munch Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lunch recommendation API server that collects restaurant data from Kakao/Naver, tracks visits with feedback, and provides personalized recommendations via OpenClaw Skill.

**Architecture:** NestJS REST API server with Prisma ORM + PostgreSQL. Collector module fetches restaurant data from Kakao Places and Naver Search APIs on a cron schedule. Recommendation module scores and ranks restaurants based on ratings, visit history, and diversity. OpenClaw Workspace Skill orchestrates the user-facing interaction.

**Tech Stack:** NestJS, TypeScript, Prisma, PostgreSQL, @nestjs/swagger, @nestjs/schedule, Jest, supertest

**Spec:** `docs/superpowers/specs/2026-03-17-more-munch-design.md`

---

## File Structure

```
apps/server/
├── src/
│   ├── main.ts                              # Bootstrap, Swagger, port 19848
│   ├── app.module.ts                        # Root module
│   ├── common/
│   │   ├── guards/api-key.guard.ts          # X-API-Key header validation
│   │   ├── filters/http-exception.filter.ts # Standard error response format
│   │   ├── utils/haversine.ts               # Distance calculation
│   │   └── utils/haversine.spec.ts          # Unit test
│   ├── prisma/
│   │   ├── prisma.module.ts                 # Global Prisma module
│   │   └── prisma.service.ts                # PrismaClient lifecycle
│   ├── settings/
│   │   ├── settings.module.ts
│   │   ├── settings.controller.ts           # GET/PATCH /settings
│   │   ├── settings.service.ts
│   │   └── dto/update-settings.dto.ts
│   ├── restaurant/
│   │   ├── restaurant.module.ts
│   │   ├── restaurant.controller.ts         # GET /restaurants, GET /restaurants/:id
│   │   ├── restaurant.service.ts
│   │   └── restaurant-matcher.service.ts    # Fuzzy name matching + closest distance
│   ├── visit/
│   │   ├── visit.module.ts
│   │   ├── visit.controller.ts              # CRUD /visits
│   │   ├── visit.service.ts
│   │   └── dto/
│   │       ├── create-visit.dto.ts
│   │       └── update-visit.dto.ts
│   ├── recommendation/
│   │   ├── recommendation.module.ts
│   │   ├── recommendation.controller.ts     # GET /recommendations
│   │   ├── recommendation.service.ts        # Orchestration
│   │   ├── scorer.service.ts                # Score calculation (swappable)
│   │   ├── reason-builder.service.ts        # Template-based reason generation
│   │   └── dto/recommendation-query.dto.ts
│   ├── stats/
│   │   ├── stats.module.ts
│   │   ├── stats.controller.ts              # GET /stats/summary
│   │   └── stats.service.ts
│   └── collector/
│       ├── collector.module.ts
│       ├── collector.service.ts             # Cron orchestration
│       ├── kakao.service.ts                 # Kakao Places API client
│       ├── naver.service.ts                 # Naver Search API client
│       ├── merger.service.ts                # Merge + combinedRating
│       └── naver-filter.service.ts          # Sponsored content detection
├── prisma/
│   ├── schema.prisma                        # Data model
│   └── seed.ts                              # Initial user + API key
├── test/
│   ├── app.e2e-spec.ts                      # E2E test setup
│   ├── settings.e2e-spec.ts
│   ├── restaurant.e2e-spec.ts
│   ├── visit.e2e-spec.ts
│   ├── recommendation.e2e-spec.ts
│   └── stats.e2e-spec.ts
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── .env.example
└── jest.config.ts
deploy/
├── Dockerfile
└── k8s/
    ├── deployment.yaml
    ├── service.yaml
    ├── postgres.yaml
    └── secrets.yaml
skill/
└── more-munch-skill.md                     # OpenClaw Workspace Skill definition
```

---

## Chunk 1: Project Scaffolding & Database

### Task 1: Initialize NestJS Project

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/tsconfig.build.json`
- Create: `apps/server/nest-cli.json`
- Create: `apps/server/.env.example`

- [ ] **Step 1: Scaffold NestJS project**

```bash
cd /Users/iseonghwa/workspace/project-more-munch
mkdir -p apps/server
cd apps/server
pnpm init
pnpm add @nestjs/core @nestjs/common @nestjs/platform-express @nestjs/swagger @nestjs/schedule @nestjs/config reflect-metadata rxjs class-validator class-transformer
pnpm add -D @nestjs/cli @nestjs/testing typescript @types/node @types/express ts-node tsx jest @types/jest ts-jest supertest @types/supertest
```

- [ ] **Step 2: Create tsconfig.json**

```json
// apps/server/tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Create tsconfig.build.json**

```json
// apps/server/tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

- [ ] **Step 4: Create nest-cli.json**

```json
// apps/server/nest-cli.json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

- [ ] **Step 5: Create .env.example**

```env
# apps/server/.env.example
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/more_munch?schema=public
SEED_API_KEY=your-api-key-here
KAKAO_REST_API_KEY=your-kakao-key
NAVER_CLIENT_ID=your-naver-client-id
NAVER_CLIENT_SECRET=your-naver-client-secret
```

- [ ] **Step 6: Add scripts to package.json**

Add to `apps/server/package.json`:
```json
{
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "jest --config ./test/jest-e2e.config.ts",
    "seed": "tsx prisma/seed.ts",
    "lint": "eslint src --ext .ts"
  }
}
```

- [ ] **Step 7: Create jest.config.ts**

```typescript
// apps/server/jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};

export default config;
```

- [ ] **Step 8: Commit**

```bash
git add apps/server/package.json apps/server/pnpm-lock.yaml apps/server/tsconfig.json apps/server/tsconfig.build.json apps/server/nest-cli.json apps/server/.env.example apps/server/jest.config.ts
git commit -m "chore: scaffold NestJS project with dependencies"
```

---

### Task 2: Prisma Schema & Migration

**Files:**
- Create: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: Install Prisma**

```bash
cd apps/server
pnpm add @prisma/client
pnpm add -D prisma
npx prisma init
```

- [ ] **Step 2: Write schema.prisma**

```prisma
// apps/server/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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
  latitude    Float
  longitude   Float
  walkMinutes Int      @default(10)
  minRating   Float    @default(3.5)
  excludeDays Int      @default(5)
  updatedAt   DateTime @updatedAt
}

model Restaurant {
  id              Int              @id @default(autoincrement())
  name            String
  address         String
  latitude        Float
  longitude       Float
  category        String?
  priceRange      String?
  kakaoId         String?          @unique
  kakaoRating     Float?
  naverId         String?          @unique
  naverRating     Float?
  naverBlogCount  Int?
  combinedRating  Float?
  businessHours   Json?
  holidays        Json?
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
  name         String
  price        Int?
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
  recommendationId Int?
  recommendation   Recommendation? @relation(fields: [recommendationId], references: [id])
  rating           Rating?
  menu             String?
  comment          String?
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
  rank          Int
  score         Float
  chosen        Boolean    @default(false)
  recommendedAt DateTime   @default(now())
  visits        Visit[]

  @@index([userId, recommendedAt])
}

enum Rating {
  AMAZING
  GOOD
  OKAY
  BAD
  NEVER
}
```

- [ ] **Step 3: Run migration**

```bash
cp .env.example .env
# Edit .env with actual DATABASE_URL
npx prisma migrate dev --name init
```

Expected: Migration created, Prisma Client generated.

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/
git commit -m "feat: add Prisma schema with all data models"
```

---

### Task 3: Seed Script

**Files:**
- Create: `apps/server/prisma/seed.ts`

- [ ] **Step 1: Write seed script**

```typescript
// apps/server/prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apiKey = process.env.SEED_API_KEY;
  if (!apiKey) {
    throw new Error('SEED_API_KEY environment variable is required');
  }

  const user = await prisma.user.upsert({
    where: { apiKey },
    update: {},
    create: {
      nickname: 'admin',
      apiKey,
    },
  });

  console.log(`User created/found: ${user.nickname} (id: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run seed**

```bash
cd apps/server
pnpm seed
```

Expected: `User created/found: admin (id: 1)`

- [ ] **Step 3: Commit**

```bash
git add apps/server/prisma/seed.ts
git commit -m "feat: add seed script for initial user with API key"
```

---

### Task 4: Prisma Module & Service

**Files:**
- Create: `apps/server/src/prisma/prisma.module.ts`
- Create: `apps/server/src/prisma/prisma.service.ts`

- [ ] **Step 1: Create PrismaService**

```typescript
// apps/server/src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 2: Create PrismaModule**

```typescript
// apps/server/src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/prisma/
git commit -m "feat: add global Prisma module"
```

---

### Task 5: Common Utilities — Haversine, API Key Guard, Exception Filter

**Files:**
- Create: `apps/server/src/common/utils/haversine.ts`
- Create: `apps/server/src/common/utils/haversine.spec.ts`
- Create: `apps/server/src/common/guards/api-key.guard.ts`
- Create: `apps/server/src/common/filters/http-exception.filter.ts`

- [ ] **Step 1: Write haversine test**

```typescript
// apps/server/src/common/utils/haversine.spec.ts
import { haversineDistance, walkingMinutes } from './haversine';

describe('haversine', () => {
  // Seoul Station (37.5547, 126.9706) to Namdaemun Market (37.5592, 126.9773)
  it('should calculate distance between two points', () => {
    const distance = haversineDistance(37.5547, 126.9706, 37.5592, 126.9773);
    expect(distance).toBeGreaterThan(600);
    expect(distance).toBeLessThan(900);
  });

  it('should return 0 for same point', () => {
    expect(haversineDistance(37.5, 127.0, 37.5, 127.0)).toBe(0);
  });

  it('should calculate walking minutes at 80m/min', () => {
    expect(walkingMinutes(800)).toBe(10);
    expect(walkingMinutes(400)).toBe(5);
    expect(walkingMinutes(120)).toBe(2); // rounds up
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm test -- --testPathPattern=haversine
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement haversine**

```typescript
// apps/server/src/common/utils/haversine.ts
const EARTH_RADIUS_M = 6371000;
const WALKING_SPEED_M_PER_MIN = 80;

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_M * c);
}

export function walkingMinutes(distanceMeters: number): number {
  return Math.ceil(distanceMeters / WALKING_SPEED_M_PER_MIN);
}

export function formatDistance(distanceMeters: number): string {
  return `도보 ${walkingMinutes(distanceMeters)}분`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/server && pnpm test -- --testPathPattern=haversine
```

Expected: PASS

- [ ] **Step 5: Implement API Key Guard**

```typescript
// apps/server/src/common/guards/api-key.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    const user = await this.prisma.user.findUnique({
      where: { apiKey },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.user = user;
    return true;
  }
}
```

- [ ] **Step 6: Implement Exception Filter**

```typescript
// apps/server/src/common/filters/http-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        message = (exResponse as any).message || message;
      }
      error = exception.name.replace('Exception', '').replace(/([A-Z])/g, ' $1').trim();
    } else {
      this.logger.error('Unhandled exception', exception);
    }

    response.status(statusCode).json({ statusCode, error, message });
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/common/
git commit -m "feat: add haversine util, API key guard, exception filter"
```

---

### Task 6: App Module & Main Bootstrap

**Files:**
- Create: `apps/server/src/main.ts`
- Create: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create AppModule**

```typescript
// apps/server/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Create main.ts**

```typescript
// apps/server/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

- [ ] **Step 3: Verify server starts**

```bash
cd apps/server && pnpm build && pnpm start
```

Expected: Server starts on port 19848, Swagger at http://localhost:19848/docs

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/main.ts apps/server/src/app.module.ts
git commit -m "feat: bootstrap NestJS with Swagger on port 19848"
```

---

## Chunk 2: Settings & Restaurant APIs

### Task 7: Settings Module

**Files:**
- Create: `apps/server/src/settings/settings.module.ts`
- Create: `apps/server/src/settings/settings.controller.ts`
- Create: `apps/server/src/settings/settings.service.ts`
- Create: `apps/server/src/settings/dto/update-settings.dto.ts`

- [ ] **Step 1: Create DTO**

```typescript
// apps/server/src/settings/dto/update-settings.dto.ts
import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(30) walkMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(5) minRating?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(30) excludeDays?: number;
}
```

- [ ] **Step 2: Create SettingsService**

```typescript
// apps/server/src/settings/settings.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: number) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    if (!settings) {
      return {
        latitude: null,
        longitude: null,
        walkMinutes: 10,
        minRating: 3.5,
        excludeDays: 5,
      };
    }
    return {
      latitude: settings.latitude,
      longitude: settings.longitude,
      walkMinutes: settings.walkMinutes,
      minRating: settings.minRating,
      excludeDays: settings.excludeDays,
    };
  }

  async update(userId: number, dto: UpdateSettingsDto) {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        latitude: dto.latitude ?? 0,
        longitude: dto.longitude ?? 0,
        walkMinutes: dto.walkMinutes ?? 10,
        minRating: dto.minRating ?? 3.5,
        excludeDays: dto.excludeDays ?? 5,
      },
      update: dto,
    });
    return {
      latitude: settings.latitude,
      longitude: settings.longitude,
      walkMinutes: settings.walkMinutes,
      minRating: settings.minRating,
      excludeDays: settings.excludeDays,
    };
  }

  async getOrThrow(userId: number) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    if (!settings || (settings.latitude === 0 && settings.longitude === 0)) {
      throw new BadRequestException('Location not set. Update settings first');
    }
    return settings;
  }
}
```

- [ ] **Step 3: Create SettingsController**

```typescript
// apps/server/src/settings/settings.controller.ts
import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('settings')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get(@Req() req: any) {
    return this.settingsService.get(req.user.id);
  }

  @Patch()
  update(@Req() req: any, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(req.user.id, dto);
  }
}
```

- [ ] **Step 4: Create SettingsModule**

```typescript
// apps/server/src/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
```

- [ ] **Step 5: Register in AppModule**

Add `SettingsModule` to `imports` in `apps/server/src/app.module.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/settings/ apps/server/src/app.module.ts
git commit -m "feat: add Settings module (GET/PATCH /settings)"
```

---

### Task 8: Restaurant Matcher Service

**Files:**
- Create: `apps/server/src/restaurant/restaurant-matcher.service.ts`

- [ ] **Step 1: Implement restaurant matcher**

```typescript
// apps/server/src/restaurant/restaurant-matcher.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { haversineDistance } from '../common/utils/haversine';

@Injectable()
export class RestaurantMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  async matchByName(name: string, userLat?: number, userLon?: number) {
    // Try exact match first
    let restaurants = await this.prisma.restaurant.findMany({
      where: { name, isActive: true },
    });

    // Try startsWith match
    if (restaurants.length === 0) {
      restaurants = await this.prisma.restaurant.findMany({
        where: { name: { startsWith: name }, isActive: true },
      });
    }

    // Try contains match
    if (restaurants.length === 0) {
      restaurants = await this.prisma.restaurant.findMany({
        where: { name: { contains: name }, isActive: true },
      });
    }

    if (restaurants.length === 0) {
      throw new BadRequestException(`Restaurant not found: ${name}`);
    }

    // If multiple matches and user location available, pick closest
    if (restaurants.length > 1 && userLat != null && userLon != null) {
      restaurants.sort(
        (a, b) =>
          haversineDistance(userLat, userLon, a.latitude, a.longitude) -
          haversineDistance(userLat, userLon, b.latitude, b.longitude),
      );
    }

    return restaurants[0];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/restaurant/restaurant-matcher.service.ts
git commit -m "feat: add restaurant fuzzy name matcher with closest-distance tiebreak"
```

---

### Task 9: Restaurant Module (CRUD)

**Files:**
- Create: `apps/server/src/restaurant/restaurant.module.ts`
- Create: `apps/server/src/restaurant/restaurant.controller.ts`
- Create: `apps/server/src/restaurant/restaurant.service.ts`

- [ ] **Step 1: Create RestaurantService**

```typescript
// apps/server/src/restaurant/restaurant.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { haversineDistance, formatDistance } from '../common/utils/haversine';

@Injectable()
export class RestaurantService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: { category?: string; name?: string; limit?: number; cursor?: number },
    userLat?: number,
    userLon?: number,
  ) {
    const { category, name, limit = 20, cursor } = query;
    const where: any = { isActive: true };
    if (category) where.category = category;
    if (name) where.name = { contains: name };

    const restaurants = await this.prisma.restaurant.findMany({
      where,
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { combinedRating: 'desc' },
      include: { menus: { take: 1, orderBy: { updatedAt: 'desc' } } },
    });

    const data = restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      address: r.address,
      distance: userLat != null ? formatDistance(haversineDistance(userLat, userLon!, r.latitude, r.longitude)) : null,
      combinedRating: r.combinedRating,
      topMenu: r.menus[0] ? { name: r.menus[0].name, price: r.menus[0].price } : null,
    }));

    const nextCursor = restaurants.length === limit ? restaurants[restaurants.length - 1].id : null;
    return { data, nextCursor };
  }

  async findOne(id: number, userId: number, userLat?: number, userLon?: number) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        menus: true,
        visits: {
          where: { userId },
          orderBy: { visitedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!restaurant || !restaurant.isActive) {
      throw new NotFoundException('Restaurant not found');
    }

    return {
      id: restaurant.id,
      name: restaurant.name,
      category: restaurant.category,
      address: restaurant.address,
      distance: userLat != null ? formatDistance(haversineDistance(userLat, userLon!, restaurant.latitude, restaurant.longitude)) : null,
      combinedRating: restaurant.combinedRating,
      kakaoRating: restaurant.kakaoRating,
      naverRating: restaurant.naverRating,
      naverBlogCount: restaurant.naverBlogCount,
      businessHours: restaurant.businessHours,
      menus: restaurant.menus.map((m) => ({ name: m.name, price: m.price })),
      myVisits: restaurant.visits.map((v) => ({
        id: v.id,
        rating: v.rating,
        menu: v.menu,
        visitedAt: v.visitedAt.toISOString().split('T')[0],
      })),
    };
  }
}
```

- [ ] **Step 2: Create RestaurantController**

```typescript
// apps/server/src/restaurant/restaurant.controller.ts
import { Controller, Get, Param, Query, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RestaurantService } from './restaurant.service';
import { SettingsService } from '../settings/settings.service';

@ApiTags('restaurants')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('restaurants')
export class RestaurantController {
  constructor(
    private readonly restaurantService: RestaurantService,
    private readonly settingsService: SettingsService,
  ) {}

  @Get()
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'name', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  async findAll(
    @Req() req: any,
    @Query('category') category?: string,
    @Query('name') name?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    const settings = await this.settingsService.get(req.user.id);
    return this.restaurantService.findAll(
      { category, name, limit, cursor },
      settings.latitude ?? undefined,
      settings.longitude ?? undefined,
    );
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const settings = await this.settingsService.get(req.user.id);
    return this.restaurantService.findOne(
      id,
      req.user.id,
      settings.latitude ?? undefined,
      settings.longitude ?? undefined,
    );
  }
}
```

- [ ] **Step 3: Create RestaurantModule**

```typescript
// apps/server/src/restaurant/restaurant.module.ts
import { Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { RestaurantMatcherService } from './restaurant-matcher.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [RestaurantController],
  providers: [RestaurantService, RestaurantMatcherService],
  exports: [RestaurantService, RestaurantMatcherService],
})
export class RestaurantModule {}
```

- [ ] **Step 4: Register in AppModule**

Add `RestaurantModule` to `imports` in `app.module.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/restaurant/ apps/server/src/app.module.ts
git commit -m "feat: add Restaurant module (GET /restaurants, GET /restaurants/:id)"
```

---

### Task 10: Visit Module (CRUD)

**Files:**
- Create: `apps/server/src/visit/visit.module.ts`
- Create: `apps/server/src/visit/visit.controller.ts`
- Create: `apps/server/src/visit/visit.service.ts`
- Create: `apps/server/src/visit/dto/create-visit.dto.ts`
- Create: `apps/server/src/visit/dto/update-visit.dto.ts`

- [ ] **Step 1: Create DTOs**

```typescript
// apps/server/src/visit/dto/create-visit.dto.ts
import { IsString, IsOptional, IsEnum, IsInt, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Rating } from '@prisma/client';

export class CreateVisitDto {
  @ApiProperty() @IsString() restaurant: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() recommendationId?: number;
  @ApiPropertyOptional({ enum: Rating }) @IsOptional() @IsEnum(Rating) rating?: Rating;
  @ApiPropertyOptional() @IsOptional() @IsString() menu?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() visitedAt?: string;
}
```

```typescript
// apps/server/src/visit/dto/update-visit.dto.ts
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Rating } from '@prisma/client';

export class UpdateVisitDto {
  @ApiPropertyOptional({ enum: Rating }) @IsOptional() @IsEnum(Rating) rating?: Rating;
  @ApiPropertyOptional() @IsOptional() @IsString() menu?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}
```

- [ ] **Step 2: Create VisitService**

```typescript
// apps/server/src/visit/visit.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantMatcherService } from '../restaurant/restaurant-matcher.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';

@Injectable()
export class VisitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matcher: RestaurantMatcherService,
  ) {}

  async create(userId: number, dto: CreateVisitDto, userLat?: number, userLon?: number) {
    const restaurant = await this.matcher.matchByName(dto.restaurant, userLat, userLon);

    const visit = await this.prisma.visit.create({
      data: {
        userId,
        restaurantId: restaurant.id,
        recommendationId: dto.recommendationId ?? null,
        rating: dto.rating ?? null,
        menu: dto.menu ?? null,
        comment: dto.comment ?? null,
        visitedAt: dto.visitedAt ? new Date(dto.visitedAt) : new Date(),
      },
      include: { restaurant: true },
    });

    // Update recommendation chosen status
    if (dto.recommendationId) {
      await this.prisma.recommendation.updateMany({
        where: { id: dto.recommendationId, userId },
        data: { chosen: true },
      });
    }

    const missingOptional: string[] = [];
    if (!visit.rating) missingOptional.push('rating');
    if (!visit.menu) missingOptional.push('menu');
    if (!visit.comment) missingOptional.push('comment');

    return {
      id: visit.id,
      restaurant: visit.restaurant.name,
      category: visit.restaurant.category,
      rating: visit.rating,
      menu: visit.menu,
      comment: visit.comment,
      visitedAt: visit.visitedAt.toISOString().split('T')[0],
      missingOptional,
    };
  }

  async findAll(
    userId: number,
    query: {
      period?: string;
      category?: string;
      restaurant?: string;
      rating?: string;
      limit?: number;
      cursor?: number;
    },
  ) {
    const { period, category, restaurant, rating, limit = 20, cursor } = query;
    const where: any = { userId };

    if (period === 'week') {
      where.visitedAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    } else if (period === 'month') {
      where.visitedAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }
    if (category) where.restaurant = { ...where.restaurant, category };
    if (restaurant) where.restaurant = { ...where.restaurant, name: { contains: restaurant } };
    if (rating) where.rating = rating;

    const visits = await this.prisma.visit.findMany({
      where,
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { visitedAt: 'desc' },
      include: { restaurant: true },
    });

    const data = visits.map((v) => ({
      id: v.id,
      restaurant: v.restaurant.name,
      category: v.restaurant.category,
      rating: v.rating,
      menu: v.menu,
      comment: v.comment,
      visitedAt: v.visitedAt.toISOString().split('T')[0],
    }));

    const nextCursor = visits.length === limit ? visits[visits.length - 1].id : null;
    return { data, nextCursor };
  }

  async findOne(id: number, userId: number) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, userId },
      include: { restaurant: true },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    return {
      id: visit.id,
      restaurant: visit.restaurant.name,
      category: visit.restaurant.category,
      rating: visit.rating,
      menu: visit.menu,
      comment: visit.comment,
      visitedAt: visit.visitedAt.toISOString().split('T')[0],
    };
  }

  async update(id: number, userId: number, dto: UpdateVisitDto) {
    const visit = await this.prisma.visit.findFirst({ where: { id, userId } });
    if (!visit) throw new NotFoundException('Visit not found');

    const updated = await this.prisma.visit.update({
      where: { id },
      data: dto,
      include: { restaurant: true },
    });

    return {
      id: updated.id,
      restaurant: updated.restaurant.name,
      category: updated.restaurant.category,
      rating: updated.rating,
      menu: updated.menu,
      comment: updated.comment,
      visitedAt: updated.visitedAt.toISOString().split('T')[0],
    };
  }

  async remove(id: number, userId: number) {
    const visit = await this.prisma.visit.findFirst({ where: { id, userId } });
    if (!visit) throw new NotFoundException('Visit not found');
    await this.prisma.visit.delete({ where: { id } });
  }
}
```

- [ ] **Step 3: Create VisitController**

```typescript
// apps/server/src/visit/visit.controller.ts
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Req, UseGuards, ParseIntPipe,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { VisitService } from './visit.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { SettingsService } from '../settings/settings.service';

@ApiTags('visits')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('visits')
export class VisitController {
  constructor(
    private readonly visitService: VisitService,
    private readonly settingsService: SettingsService,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateVisitDto) {
    const settings = await this.settingsService.get(req.user.id);
    return this.visitService.create(
      req.user.id, dto,
      settings.latitude ?? undefined,
      settings.longitude ?? undefined,
    );
  }

  @Get()
  @ApiQuery({ name: 'period', required: false }) @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'restaurant', required: false }) @ApiQuery({ name: 'rating', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number }) @ApiQuery({ name: 'cursor', required: false, type: Number })
  findAll(
    @Req() req: any,
    @Query('period') period?: string, @Query('category') category?: string,
    @Query('restaurant') restaurant?: string, @Query('rating') rating?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.visitService.findAll(req.user.id, { period, category, restaurant, rating, limit, cursor });
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.visitService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVisitDto) {
    return this.visitService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.visitService.remove(id, req.user.id);
  }
}
```

- [ ] **Step 4: Create VisitModule and register**

```typescript
// apps/server/src/visit/visit.module.ts
import { Module } from '@nestjs/common';
import { VisitController } from './visit.controller';
import { VisitService } from './visit.service';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [RestaurantModule, SettingsModule],
  controllers: [VisitController],
  providers: [VisitService],
  exports: [VisitService],
})
export class VisitModule {}
```

Add `VisitModule` to `imports` in `app.module.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/visit/ apps/server/src/app.module.ts
git commit -m "feat: add Visit module (CRUD /visits with restaurant name matching)"
```

---

## Chunk 3: Recommendation Engine

### Task 11: Scorer Service (Swappable)

**Files:**
- Create: `apps/server/src/recommendation/scorer.service.ts`

- [ ] **Step 1: Write scorer test**

```typescript
// apps/server/src/recommendation/scorer.spec.ts
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
    expect(score).toBe(4.5); // 4.0 + 0.5 diversity bonus
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm test -- --testPathPattern=scorer
```

- [ ] **Step 3: Implement ScorerService**

```typescript
// apps/server/src/recommendation/scorer.service.ts
import { Injectable } from '@nestjs/common';

export interface ScoreInput {
  combinedRating: number;
  recentCategories: string[];
  category: string | null;
  visitedInExcludeDays: boolean;
  neverRated: boolean;
  ignoredCount: number; // recommended but never visited
}

@Injectable()
export class ScorerService {
  calculate(input: ScoreInput): number {
    // Hard exclusions
    if (input.visitedInExcludeDays) return 0;
    if (input.neverRated) return 0;
    if (input.ignoredCount >= 3) return 0;

    let score = input.combinedRating;

    // Category diversity bonus
    if (input.category && !input.recentCategories.includes(input.category)) {
      score += 0.5;
    }

    return Math.round(score * 100) / 100;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/server && pnpm test -- --testPathPattern=scorer
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/recommendation/scorer.service.ts apps/server/src/recommendation/scorer.spec.ts
git commit -m "feat: add ScorerService with MVP rule-based scoring"
```

---

### Task 12: Reason Builder Service

**Files:**
- Create: `apps/server/src/recommendation/reason-builder.service.ts`

- [ ] **Step 1: Implement reason builder**

```typescript
// apps/server/src/recommendation/reason-builder.service.ts
import { Injectable } from '@nestjs/common';

export interface ReasonInput {
  combinedRating: number | null;
  hasVisited: boolean;
  lastVisitDaysAgo: number | null;
  bestRating: string | null; // AMAZING, GOOD, etc.
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/recommendation/reason-builder.service.ts
git commit -m "feat: add template-based reason builder for recommendations"
```

---

### Task 13: Recommendation Service & Controller

**Files:**
- Create: `apps/server/src/recommendation/recommendation.service.ts`
- Create: `apps/server/src/recommendation/recommendation.controller.ts`
- Create: `apps/server/src/recommendation/recommendation.module.ts`
- Create: `apps/server/src/recommendation/dto/recommendation-query.dto.ts`

- [ ] **Step 1: Create DTO**

```typescript
// apps/server/src/recommendation/dto/recommendation-query.dto.ts
import { IsOptional, IsString, IsBoolean, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class RecommendationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() priceRange?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() unvisited?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) count?: number = 3;
}
```

- [ ] **Step 2: Implement RecommendationService**

```typescript
// apps/server/src/recommendation/recommendation.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ScorerService, ScoreInput } from './scorer.service';
import { ReasonBuilderService } from './reason-builder.service';
import { haversineDistance, walkingMinutes, formatDistance } from '../common/utils/haversine';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';

@Injectable()
export class RecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly scorer: ScorerService,
    private readonly reasonBuilder: ReasonBuilderService,
  ) {}

  async recommend(userId: number, query: RecommendationQueryDto) {
    const settings = await this.settingsService.getOrThrow(userId);
    const count = query.count ?? 3;

    // Get all active restaurants
    // Note: combinedRating may be null when external APIs don't provide ratings.
    // Null-rated restaurants use minRating as baseline score instead of being excluded.
    const where: any = { isActive: true };
    if (query.category) where.category = query.category;
    if (query.priceRange) where.priceRange = query.priceRange;

    const restaurants = await this.prisma.restaurant.findMany({
      where,
      include: { menus: true },
    });

    // Get recent visits for exclusion
    const excludeDate = new Date();
    excludeDate.setDate(excludeDate.getDate() - settings.excludeDays);
    const recentVisits = await this.prisma.visit.findMany({
      where: { userId, visitedAt: { gte: excludeDate } },
      include: { restaurant: true },
    });
    const recentRestaurantIds = new Set(recentVisits.map((v) => v.restaurantId));

    // Get recent categories (last 3 days)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const recentCategories = recentVisits
      .filter((v) => v.visitedAt >= threeDaysAgo && v.restaurant.category)
      .map((v) => v.restaurant.category!);

    // Get NEVER rated restaurants
    const neverVisits = await this.prisma.visit.findMany({
      where: { userId, rating: 'NEVER' },
      select: { restaurantId: true },
    });
    const neverRestaurantIds = new Set(neverVisits.map((v) => v.restaurantId));

    // Get ignored restaurants (recommended 3+ times, never visited)
    const ignoredCounts = await this.getIgnoredCounts(userId);

    // Get all visits (for unvisited filter + hasVisited + lastVisitDaysAgo)
    const allVisits = await this.prisma.visit.findMany({
      where: { userId },
      select: { restaurantId: true, visitedAt: true },
      orderBy: { visitedAt: 'desc' },
    });
    const allVisitedIds = query.unvisited
      ? new Set(allVisits.map((v) => v.restaurantId))
      : null;
    const allVisitedSet = new Set(allVisits.map((v) => v.restaurantId));
    // Most recent visit per restaurant (across all time)
    const lastVisitByRestaurant = new Map<number, Date>();
    for (const v of allVisits) {
      if (!lastVisitByRestaurant.has(v.restaurantId)) {
        lastVisitByRestaurant.set(v.restaurantId, v.visitedAt);
      }
    }

    // Get best ratings per restaurant
    const bestRatings = await this.getBestRatings(userId);

    // Score and filter
    const scored = restaurants
      .filter((r) => {
        const dist = haversineDistance(settings.latitude, settings.longitude, r.latitude, r.longitude);
        if (walkingMinutes(dist) > settings.walkMinutes) return false;
        if (r.combinedRating != null && r.combinedRating < settings.minRating) return false;
        if (allVisitedIds && allVisitedIds.has(r.id)) return false;
        if (!this.isOpenForLunch(r.businessHours)) return false;
        return true;
      })
      .map((r) => {
        const dist = haversineDistance(settings.latitude, settings.longitude, r.latitude, r.longitude);
        const effectiveRating = r.combinedRating ?? settings.minRating;
        const input: ScoreInput = {
          combinedRating: effectiveRating,
          recentCategories,
          category: r.category,
          visitedInExcludeDays: recentRestaurantIds.has(r.id),
          neverRated: neverRestaurantIds.has(r.id),
          ignoredCount: ignoredCounts.get(r.id) ?? 0,
        };
        const score = this.scorer.calculate(input);
        const lastVisitDate = lastVisitByRestaurant.get(r.id);
        const lastVisitDaysAgo = lastVisitDate
          ? Math.floor((Date.now() - lastVisitDate.getTime()) / (24 * 60 * 60 * 1000))
          : null;

        return {
          restaurant: r,
          score,
          distance: dist,
          reason: this.reasonBuilder.build({
            combinedRating: r.combinedRating,
            hasVisited: allVisitedSet.has(r.id),
            lastVisitDaysAgo,
            bestRating: bestRatings.get(r.id) ?? null,
            naverBlogCount: r.naverBlogCount,
          }),
        };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, count);

    if (scored.length === 0) {
      return {
        pick: null,
        alternatives: [],
        message: '조건에 맞는 식당이 없습니다. 거리나 평점 기준을 조정해보세요.',
        recommendedAt: new Date().toISOString(),
      };
    }

    // Save recommendations
    const recommendations = await Promise.all(
      scored.map((s, i) =>
        this.prisma.recommendation.create({
          data: {
            userId,
            restaurantId: s.restaurant.id,
            rank: i + 1,
            score: s.score,
          },
        }),
      ),
    );

    const formatEntry = (s: typeof scored[0], rec: typeof recommendations[0], menuLimit: number) => ({
      id: rec.id,
      restaurantId: s.restaurant.id,
      restaurant: {
        name: s.restaurant.name,
        category: s.restaurant.category,
        address: s.restaurant.address,
        distance: formatDistance(s.distance),
        combinedRating: s.restaurant.combinedRating,
        menus: s.restaurant.menus.slice(0, menuLimit).map((m) => ({ name: m.name, price: m.price })),
      },
      reason: s.reason,
      score: s.score,
    });

    const pick = formatEntry(scored[0], recommendations[0], 3);
    const alternatives = scored.slice(1).map((s, i) => formatEntry(s, recommendations[i + 1], 1));

    return {
      pick,
      alternatives,
      recommendedAt: new Date().toISOString(),
    };
  }

  private async getIgnoredCounts(userId: number): Promise<Map<number, number>> {
    const recs = await this.prisma.recommendation.groupBy({
      by: ['restaurantId'],
      where: { userId, chosen: false },
      _count: { id: true },
    });
    const visited = await this.prisma.recommendation.findMany({
      where: { userId, chosen: true },
      select: { restaurantId: true },
    });
    const visitedIds = new Set(visited.map((v) => v.restaurantId));
    const map = new Map<number, number>();
    for (const r of recs) {
      if (!visitedIds.has(r.restaurantId)) {
        map.set(r.restaurantId, r._count.id);
      }
    }
    return map;
  }

  private isOpenForLunch(businessHours: any): boolean {
    if (!businessHours) return true; // No data = assume open
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const today = days[new Date().getDay()];
    const hours = businessHours[today];
    if (!hours) return false; // Day not listed = closed
    // Check if lunch hours (11:00-14:00) overlap with business hours
    const [open, close] = hours.split('-').map((t: string) => parseInt(t.replace(':', '')));
    return open <= 1100 && close >= 1400 || open <= 1400 && close >= 1100;
  }

  private async getBestRatings(userId: number): Promise<Map<number, string>> {
    const visits = await this.prisma.visit.findMany({
      where: { userId, rating: { not: null } },
      select: { restaurantId: true, rating: true },
    });
    const map = new Map<number, string>();
    const order = ['AMAZING', 'GOOD', 'OKAY', 'BAD', 'NEVER'];
    for (const v of visits) {
      const current = map.get(v.restaurantId);
      if (!current || order.indexOf(v.rating!) < order.indexOf(current)) {
        map.set(v.restaurantId, v.rating!);
      }
    }
    return map;
  }
}
```

- [ ] **Step 3: Create RecommendationController**

```typescript
// apps/server/src/recommendation/recommendation.controller.ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RecommendationService } from './recommendation.service';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';

@ApiTags('recommendations')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get()
  recommend(@Req() req: any, @Query() query: RecommendationQueryDto) {
    return this.recommendationService.recommend(req.user.id, query);
  }
}
```

- [ ] **Step 4: Create RecommendationModule and register**

```typescript
// apps/server/src/recommendation/recommendation.module.ts
import { Module } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { ScorerService } from './scorer.service';
import { ReasonBuilderService } from './reason-builder.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [RecommendationController],
  providers: [RecommendationService, ScorerService, ReasonBuilderService],
})
export class RecommendationModule {}
```

Add `RecommendationModule` to `imports` in `app.module.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/recommendation/ apps/server/src/app.module.ts
git commit -m "feat: add Recommendation module with scoring engine and reason builder"
```

---

## Chunk 4: Stats & Collector

### Task 14: Stats Module

**Files:**
- Create: `apps/server/src/stats/stats.module.ts`
- Create: `apps/server/src/stats/stats.controller.ts`
- Create: `apps/server/src/stats/stats.service.ts`

- [ ] **Step 1: Implement StatsService**

```typescript
// apps/server/src/stats/stats.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: number) {
    const totalVisits = await this.prisma.visit.count({ where: { userId } });

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    const thisMonthVisits = await this.prisma.visit.count({
      where: { userId, visitedAt: { gte: thisMonthStart } },
    });

    const uniqueRestaurants = await this.prisma.visit.findMany({
      where: { userId },
      distinct: ['restaurantId'],
      select: { restaurantId: true },
    });

    // Favorite category
    const categoryGroups = await this.prisma.visit.groupBy({
      by: ['restaurantId'],
      where: { userId },
      _count: { id: true },
    });
    const restaurantIds = categoryGroups.map((g) => g.restaurantId);
    const restaurants = await this.prisma.restaurant.findMany({
      where: { id: { in: restaurantIds } },
      select: { id: true, name: true, category: true },
    });
    const restaurantMap = new Map(restaurants.map((r) => [r.id, r]));

    const categoryCounts = new Map<string, number>();
    const restaurantCounts = new Map<string, number>();
    for (const g of categoryGroups) {
      const r = restaurantMap.get(g.restaurantId);
      if (r?.category) {
        categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + g._count.id);
      }
      if (r) {
        restaurantCounts.set(r.name, (restaurantCounts.get(r.name) ?? 0) + g._count.id);
      }
    }

    const favoriteCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const favoriteRestaurant = [...restaurantCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Rating distribution
    const ratings = await this.prisma.visit.groupBy({
      by: ['rating'],
      where: { userId, rating: { not: null } },
      _count: { id: true },
    });
    const ratingDistribution: Record<string, number> = {};
    for (const r of ratings) {
      if (r.rating) ratingDistribution[r.rating] = r._count.id;
    }

    return {
      totalVisits,
      thisMonthVisits,
      uniqueRestaurants: uniqueRestaurants.length,
      favoriteCategory,
      favoriteRestaurant,
      ratingDistribution,
    };
  }
}
```

- [ ] **Step 2: Create StatsController**

```typescript
// apps/server/src/stats/stats.controller.ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { StatsService } from './stats.service';

@ApiTags('stats')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('summary')
  getSummary(@Req() req: any) {
    return this.statsService.getSummary(req.user.id);
  }
}
```

- [ ] **Step 3: Create StatsModule and register**

```typescript
// apps/server/src/stats/stats.module.ts
import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
```

Add `StatsModule` to `imports` in `app.module.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/stats/ apps/server/src/app.module.ts
git commit -m "feat: add Stats module (GET /stats/summary)"
```

---

### Task 15: Collector — Kakao & Naver API Clients

**Files:**
- Create: `apps/server/src/collector/kakao.service.ts`
- Create: `apps/server/src/collector/naver.service.ts`

- [ ] **Step 1: Implement KakaoService**

```typescript
// apps/server/src/collector/kakao.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface KakaoPlace {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string | null;
  rating: number | null;
  businessHours: Record<string, string> | null;
}

@Injectable()
export class KakaoService {
  private readonly logger = new Logger(KakaoService.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.getOrThrow('KAKAO_REST_API_KEY');
  }

  async searchRestaurants(lat: number, lon: number, radiusM: number): Promise<KakaoPlace[]> {
    const places: KakaoPlace[] = [];
    let page = 1;
    let isEnd = false;

    while (!isEnd && page <= 3) {
      const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=FD6&x=${lon}&y=${lat}&radius=${radiusM}&page=${page}&size=15&sort=accuracy`;
      const data = await this.fetchWithRetry(url);
      if (!data) break;

      isEnd = data.meta.is_end;
      for (const doc of data.documents) {
        places.push({
          id: doc.id,
          name: doc.place_name,
          address: doc.road_address_name || doc.address_name,
          latitude: parseFloat(doc.y),
          longitude: parseFloat(doc.x),
          category: this.parseCategory(doc.category_name),
          rating: null, // Kakao category search doesn't return ratings
          businessHours: null,
        });
      }
      page++;
    }

    return places;
  }

  private async fetchWithRetry(url: string, maxRetries = 3): Promise<any | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `KakaoAK ${this.apiKey}` },
        });
        if (!res.ok) {
          this.logger.warn(`Kakao API error: ${res.status} (attempt ${attempt + 1})`);
          if (attempt < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
            continue;
          }
          return null;
        }
        return await res.json();
      } catch (error) {
        this.logger.error(`Kakao API fetch failed (attempt ${attempt + 1})`, error);
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
    }
    return null;
  }

  private parseCategory(categoryName: string): string | null {
    // "음식점 > 중식" → "중식"
    const parts = categoryName.split('>').map((s) => s.trim());
    return parts.length > 1 ? parts[parts.length - 1] : null;
  }
}
```

- [ ] **Step 2: Implement NaverService**

```typescript
// apps/server/src/collector/naver.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NaverPlace {
  title: string;
  address: string;
  mapx: number;
  mapy: number;
  category: string | null;
  description: string;
  link: string;
}

@Injectable()
export class NaverService {
  private readonly logger = new Logger(NaverService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.getOrThrow('NAVER_CLIENT_ID');
    this.clientSecret = this.config.getOrThrow('NAVER_CLIENT_SECRET');
  }

  async searchRestaurants(query: string, display = 20): Promise<NaverPlace[]> {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=${display}&sort=random`;
        const res = await fetch(url, {
          headers: {
            'X-Naver-Client-Id': this.clientId,
            'X-Naver-Client-Secret': this.clientSecret,
          },
        });

        if (!res.ok) {
          this.logger.warn(`Naver API error: ${res.status} (attempt ${attempt + 1})`);
          if (attempt < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
            continue;
          }
          return [];
        }

        const data = await res.json();
        return data.items.map((item: any) => ({
          title: item.title.replace(/<[^>]*>/g, ''), // Strip HTML tags
          address: item.roadAddress || item.address,
          mapx: parseInt(item.mapx) / 10000000,
          mapy: parseInt(item.mapy) / 10000000,
          category: item.category?.split('>').pop()?.trim() || null,
          description: item.description,
          link: item.link,
        }));
      } catch (error) {
        this.logger.error(`Naver API fetch failed (attempt ${attempt + 1})`, error);
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
    }
    return [];
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/collector/kakao.service.ts apps/server/src/collector/naver.service.ts
git commit -m "feat: add Kakao and Naver API client services"
```

---

### Task 16: Collector — Merger & Filter

**Files:**
- Create: `apps/server/src/collector/merger.service.ts`
- Create: `apps/server/src/collector/naver-filter.service.ts`

- [ ] **Step 1: Implement NaverFilterService**

```typescript
// apps/server/src/collector/naver-filter.service.ts
import { Injectable } from '@nestjs/common';

const SPONSORED_KEYWORDS = ['체험단', '제공받아', '협찬', '원고료', '소정의'];

@Injectable()
export class NaverFilterService {
  /**
   * Returns adjusted Naver weight (0.3 if suspected sponsored, 0.5 otherwise)
   */
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
```

- [ ] **Step 2: Implement MergerService**

```typescript
// apps/server/src/collector/merger.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KakaoPlace } from './kakao.service';
import { NaverPlace } from './naver.service';
import { NaverFilterService } from './naver-filter.service';

@Injectable()
export class MergerService {
  private readonly logger = new Logger(MergerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly naverFilter: NaverFilterService,
  ) {}

  async mergeAndSave(kakaoPlaces: KakaoPlace[], naverPlaces: NaverPlace[]) {
    // Index Naver places by normalized name for matching
    const naverMap = new Map<string, NaverPlace>();
    for (const np of naverPlaces) {
      naverMap.set(this.normalize(np.title), np);
    }

    let upsertCount = 0;

    for (const kp of kakaoPlaces) {
      const naverMatch = naverMap.get(this.normalize(kp.name));
      const combinedRating = this.naverFilter.calculateCombinedRating(
        kp.rating,
        null, // Naver local search doesn't return ratings directly
        naverMatch?.description,
      );

      await this.prisma.restaurant.upsert({
        where: { kakaoId: kp.id },
        create: {
          name: kp.name,
          address: kp.address,
          latitude: kp.latitude,
          longitude: kp.longitude,
          category: kp.category,
          kakaoId: kp.id,
          kakaoRating: kp.rating,
          naverId: naverMatch ? this.normalize(naverMatch.title) : null,
          naverRating: null,
          combinedRating,
          businessHours: kp.businessHours,
          isActive: true,
          lastSyncedAt: new Date(),
        },
        update: {
          name: kp.name,
          address: kp.address,
          category: kp.category,
          kakaoRating: kp.rating,
          combinedRating,
          businessHours: kp.businessHours,
          isActive: true,
          lastSyncedAt: new Date(),
        },
      });
      upsertCount++;
    }

    // Handle Naver-only places
    for (const np of naverPlaces) {
      const normalizedName = this.normalize(np.title);
      const existsInKakao = kakaoPlaces.some((kp) => this.normalize(kp.name) === normalizedName);
      if (existsInKakao) continue;

      await this.prisma.restaurant.upsert({
        where: { name_address: { name: np.title, address: np.address } },
        create: {
          name: np.title,
          address: np.address,
          latitude: np.mapy,
          longitude: np.mapx,
          category: np.category,
          naverRating: null,
          combinedRating: null,
          isActive: true,
          lastSyncedAt: new Date(),
        },
        update: {
          category: np.category,
          isActive: true,
          lastSyncedAt: new Date(),
        },
      }).catch(() => {}); // Ignore duplicate errors
      upsertCount++;
    }

    this.logger.log(`Merged ${upsertCount} restaurants`);
  }

  private normalize(name: string): string {
    return name.replace(/\s+/g, '').toLowerCase();
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/collector/merger.service.ts apps/server/src/collector/naver-filter.service.ts
git commit -m "feat: add merger and Naver sponsored content filter"
```

---

### Task 17: Collector — Cron Orchestration

**Files:**
- Create: `apps/server/src/collector/collector.service.ts`
- Create: `apps/server/src/collector/collector.module.ts`

- [ ] **Step 1: Implement CollectorService**

```typescript
// apps/server/src/collector/collector.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KakaoService } from './kakao.service';
import { NaverService } from './naver.service';
import { MergerService } from './merger.service';

@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kakao: KakaoService,
    private readonly naver: NaverService,
    private readonly merger: MergerService,
  ) {}

  // Daily at 04:00 — update existing restaurants
  @Cron('0 4 * * *')
  async dailyUpdate() {
    this.logger.log('Starting daily restaurant data update');
    await this.collect();
  }

  // Weekly Sunday at 04:00 — full rescan
  @Cron('0 4 * * 0')
  async weeklyFullScan() {
    this.logger.log('Starting weekly full restaurant scan');
    await this.collect();
    // Mark restaurants not seen in this sync as inactive
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    await this.prisma.restaurant.updateMany({
      where: { lastSyncedAt: { lt: oneWeekAgo } },
      data: { isActive: false },
    });
  }

  async collect() {
    // Get user settings for location
    const settings = await this.prisma.userSettings.findFirst();
    if (!settings) {
      this.logger.warn('No user settings found, skipping collection');
      return;
    }

    const radiusM = Math.round(settings.walkMinutes * 80 * 1.2); // +20% buffer

    try {
      const kakaoPlaces = await this.kakao.searchRestaurants(
        settings.latitude,
        settings.longitude,
        radiusM,
      );

      const naverPlaces = await this.naver.searchRestaurants(
        `${settings.latitude},${settings.longitude} 맛집`,
      );

      await this.merger.mergeAndSave(kakaoPlaces, naverPlaces);

      this.logger.log(`Collection complete: ${kakaoPlaces.length} Kakao, ${naverPlaces.length} Naver`);
    } catch (error) {
      this.logger.error('Collection failed', error);
    }
  }
}
```

- [ ] **Step 2: Create CollectorModule and register**

```typescript
// apps/server/src/collector/collector.module.ts
import { Module } from '@nestjs/common';
import { CollectorService } from './collector.service';
import { KakaoService } from './kakao.service';
import { NaverService } from './naver.service';
import { MergerService } from './merger.service';
import { NaverFilterService } from './naver-filter.service';

@Module({
  providers: [CollectorService, KakaoService, NaverService, MergerService, NaverFilterService],
  exports: [CollectorService],
})
export class CollectorModule {}
```

Add `CollectorModule` to `imports` in `app.module.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/collector/ apps/server/src/app.module.ts
git commit -m "feat: add Collector module with Kakao/Naver cron collection"
```

---

## Chunk 5: Deployment & Skill

### Task 18: Dockerfile

**Files:**
- Create: `deploy/Dockerfile`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
# deploy/Dockerfile
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY apps/server/package.json apps/server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/server/ ./
RUN npx prisma generate
RUN pnpm build

FROM node:22-alpine AS runner
RUN corepack enable
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 19848
CMD ["node", "dist/main"]
```

- [ ] **Step 2: Commit**

```bash
git add deploy/Dockerfile
git commit -m "feat: add multi-stage Dockerfile for NestJS server"
```

---

### Task 19: Kubernetes Manifests

**Files:**
- Create: `deploy/k8s/deployment.yaml`
- Create: `deploy/k8s/service.yaml`
- Create: `deploy/k8s/postgres.yaml`
- Create: `deploy/k8s/secrets.yaml`

- [ ] **Step 1: Write deployment.yaml**

```yaml
# deploy/k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: more-munch-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: more-munch-server
  template:
    metadata:
      labels:
        app: more-munch-server
    spec:
      containers:
        - name: server
          image: more-munch-server:latest
          ports:
            - containerPort: 19848
          envFrom:
            - secretRef:
                name: more-munch-secrets
```

- [ ] **Step 2: Write service.yaml**

```yaml
# deploy/k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: more-munch-server
spec:
  selector:
    app: more-munch-server
  ports:
    - port: 19848
      targetPort: 19848
```

- [ ] **Step 3: Write postgres.yaml**

```yaml
# deploy/k8s/postgres.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: more-munch-postgres
spec:
  serviceName: more-munch-postgres
  replicas: 1
  selector:
    matchLabels:
      app: more-munch-postgres
  template:
    metadata:
      labels:
        app: more-munch-postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              value: more_munch
            - name: POSTGRES_USER
              value: postgres
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: more-munch-secrets
                  key: POSTGRES_PASSWORD
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 5Gi
---
apiVersion: v1
kind: Service
metadata:
  name: more-munch-postgres
spec:
  selector:
    app: more-munch-postgres
  ports:
    - port: 5432
      targetPort: 5432
```

- [ ] **Step 4: Write secrets.yaml**

```yaml
# deploy/k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: more-munch-secrets
type: Opaque
stringData:
  # Replace these values before applying
  DATABASE_URL: "postgresql://postgres:changeme@more-munch-postgres:5432/more_munch?schema=public"
  POSTGRES_PASSWORD: "changeme"
  SEED_API_KEY: "changeme"
  KAKAO_REST_API_KEY: "changeme"
  NAVER_CLIENT_ID: "changeme"
  NAVER_CLIENT_SECRET: "changeme"
```

- [ ] **Step 5: Commit**

```bash
git add deploy/k8s/
git commit -m "feat: add k8s manifests for server, postgres, secrets"
```

---

### Task 20: OpenClaw Workspace Skill Definition

**Files:**
- Create: `skill/more-munch-skill.md`

- [ ] **Step 1: Write skill definition**

```markdown
<!-- skill/more-munch-skill.md -->
# More Munch Skill

직장인의 점심 고민을 해결하는 도우미.

## Tools

- `get_recommendations` — GET /recommendations — 점심 식당 추천. 카테고리/가격대/안가본곳 필터 가능
- `create_visit` — POST /visits — 방문 기록 생성. 식당명 + 선택적 평가/메뉴/한줄평
- `update_visit` — PATCH /visits/:id — 방문 기록에 피드백 추가/수정
- `delete_visit` — DELETE /visits/:id — 방문 기록 삭제
- `get_visits` — GET /visits — 방문 기록 목록. 기간/카테고리/식당명 필터
- `get_restaurant` — GET /restaurants/:id — 식당 상세 정보 (메뉴, 내 방문 이력)
- `get_restaurants` — GET /restaurants — 수집된 식당 목록 검색
- `get_stats` — GET /stats/summary — 점심 통계 (총 방문, 선호 카테고리 등)
- `get_settings` — GET /settings — 현재 설정 조회
- `update_settings` — PATCH /settings — 설정 변경 (거리, 평점 기준, 배제 일수 등)

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

- [ ] **Step 2: Commit**

```bash
git add skill/
git commit -m "feat: add OpenClaw workspace skill definition"
```

---

### Task 21: Final AppModule Assembly & Verification

**Files:**
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Verify final AppModule has all modules**

```typescript
// apps/server/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { VisitModule } from './visit/visit.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { StatsModule } from './stats/stats.module';
import { CollectorModule } from './collector/collector.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SettingsModule,
    RestaurantModule,
    VisitModule,
    RecommendationModule,
    StatsModule,
    CollectorModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Build and verify**

```bash
cd apps/server && pnpm build
```

Expected: Successful build with no errors.

- [ ] **Step 3: Run all tests**

```bash
cd apps/server && pnpm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/app.module.ts
git commit -m "feat: assemble all modules in AppModule, verify build"
```
