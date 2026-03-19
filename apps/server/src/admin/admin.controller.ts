import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';

@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Auth ───────────────────────────────────────────

  @Get('login')
  getLogin(@Req() req: Request, @Res() res: Response) {
    if ((req.session as any).userId) {
      return res.redirect('/admin');
    }
    return res.render('admin/login', { error: null });
  }

  @Post('login')
  async postLogin(
    @Body('apiKey') apiKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!apiKey) {
      return res.render('admin/login', { error: 'API Key를 입력해주세요.' });
    }

    const user = await this.prisma.user.findUnique({
      where: { apiKey },
    });

    if (!user) {
      return res.render('admin/login', {
        error: '유효하지 않은 API Key입니다.',
      });
    }

    (req.session as any).userId = user.id;
    (req.session as any).nickname = user.nickname;
    return res.redirect('/admin');
  }

  @Get('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => {
      res.redirect('/admin/login');
    });
  }

  // ─── Task 3: Dashboard ─────────────────────────────

  @Get()
  @UseGuards(AdminGuard)
  async dashboard(@Req() req: Request, @Res() res: Response) {
    const userId = (req.session as any).userId;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const [
      restaurantCount,
      weekVisitCount,
      lastSyncRestaurant,
      recentRecommendations,
      recentVisits,
    ] = await Promise.all([
      this.prisma.restaurant.count(),
      this.prisma.visit.count({
        where: {
          userId,
          visitedAt: { gte: weekStart },
        },
      }),
      this.prisma.restaurant.findFirst({
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true },
      }),
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

    const lastSyncTime = lastSyncRestaurant
      ? lastSyncRestaurant.lastSyncedAt.toLocaleString('ko-KR')
      : null;

    return res.render('admin/dashboard', {
      title: '대시보드',
      currentPath: '/admin',
      restaurantCount,
      weekVisitCount,
      lastSyncTime,
      recentRecommendations,
      recentVisits,
    });
  }

  // ─── Task 4: Restaurant List ───────────────────────

  @Get('restaurants')
  @UseGuards(AdminGuard)
  async restaurants(
    @Query('search') search: string,
    @Query('category') category: string,
    @Query('active') active: string,
    @Query('cursor') cursor: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const isHtmx = !!req.headers['hx-request'];
    const take = 20;

    const where: any = {};
    if (search) {
      where.name = { contains: search };
    }
    if (category) {
      where.category = category;
    }
    if (active === 'true') {
      where.isActive = true;
    } else if (active === 'false') {
      where.isActive = false;
    }

    const findArgs: any = {
      where,
      orderBy: { id: 'desc' as const },
      take: take + 1,
      include: {
        _count: { select: { menus: true } },
      },
    };

    if (cursor) {
      findArgs.cursor = { id: parseInt(cursor) };
      findArgs.skip = 1;
    }

    const restaurants = await this.prisma.restaurant.findMany(findArgs);
    const hasMore = restaurants.length > take;
    if (hasMore) restaurants.pop();
    const nextCursor = hasMore ? restaurants[restaurants.length - 1].id : null;

    const categories = await this.prisma.restaurant
      .findMany({
        where: { category: { not: null } },
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      })
      .then((rows) => rows.map((r) => r.category).filter(Boolean));

    const data = {
      title: '식당 관리',
      currentPath: '/admin/restaurants',
      restaurants,
      categories,
      search: search || '',
      category: category || '',
      active: active || '',
      hasMore,
      nextCursor,
      cursor: cursor || '',
    };

    if (isHtmx) {
      return res.render('partials/restaurant-table', data);
    }
    return res.render('admin/restaurants', data);
  }

  // ─── Task 5: Restaurant Detail ─────────────────────

  @Get('restaurants/:id')
  @UseGuards(AdminGuard)
  async restaurantDetail(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: parseInt(id) },
      include: { menus: { orderBy: { name: 'asc' } } },
    });

    if (!restaurant) {
      return res.status(404).send('Not found');
    }

    return res.render('partials/restaurant-detail', {
      restaurant,
      message: null,
    });
  }

  @Post('restaurants/:id')
  @UseGuards(AdminGuard)
  async updateRestaurant(
    @Param('id') id: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    await this.prisma.restaurant.update({
      where: { id: parseInt(id) },
      data: {
        name: body.name,
        category: body.category || null,
        address: body.address,
        priceRange: body.priceRange || null,
        isActive: body.isActive === 'true',
      },
    });

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: parseInt(id) },
      include: { menus: { orderBy: { name: 'asc' } } },
    });

    return res.render('partials/restaurant-detail', {
      restaurant,
      message: '저장되었습니다.',
    });
  }

  @Post('restaurants/:id/menus')
  @UseGuards(AdminGuard)
  async addMenu(
    @Param('id') id: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    await this.prisma.menuItem.create({
      data: {
        restaurantId: parseInt(id),
        name: body.name,
        price: body.price ? parseInt(body.price) : null,
      },
    });

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: parseInt(id) },
      include: { menus: { orderBy: { name: 'asc' } } },
    });

    return res.render('partials/restaurant-detail', {
      restaurant,
      message: null,
    });
  }

  @Post('restaurants/:id/menus/:menuId/delete')
  @UseGuards(AdminGuard)
  async deleteMenu(
    @Param('id') id: string,
    @Param('menuId') menuId: string,
    @Res() res: Response,
  ) {
    await this.prisma.menuItem.delete({
      where: { id: parseInt(menuId) },
    });

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: parseInt(id) },
      include: { menus: { orderBy: { name: 'asc' } } },
    });

    return res.render('partials/restaurant-detail', {
      restaurant,
      message: null,
    });
  }

  // ─── Task 6: Visit History ─────────────────────────

  @Get('visits')
  @UseGuards(AdminGuard)
  async visits(
    @Query('period') period: string,
    @Query('rating') rating: string,
    @Query('search') search: string,
    @Query('cursor') cursor: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const isHtmx = !!req.headers['hx-request'];
    const userId = (req.session as any).userId;
    const take = 20;
    period = period || 'week';

    const where: any = { userId };

    // Period filter
    if (period === 'week') {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      where.visitedAt = { gte: weekStart };
    } else if (period === 'month') {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      where.visitedAt = { gte: monthStart };
    }

    if (rating) {
      where.rating = rating;
    }

    if (search) {
      where.restaurant = { name: { contains: search } };
    }

    const findArgs: any = {
      where,
      orderBy: { visitedAt: 'desc' as const },
      take: take + 1,
      include: { restaurant: { select: { name: true } } },
    };

    if (cursor) {
      findArgs.cursor = { id: parseInt(cursor) };
      findArgs.skip = 1;
    }

    const visits = await this.prisma.visit.findMany(findArgs);
    const hasMore = visits.length > take;
    if (hasMore) visits.pop();
    const nextCursor = hasMore ? visits[visits.length - 1].id : null;

    const data = {
      title: '방문 기록',
      currentPath: '/admin/visits',
      visits,
      period,
      rating: rating || '',
      search: search || '',
      hasMore,
      nextCursor,
    };

    if (isHtmx) {
      return res.render('partials/visit-table', data);
    }
    return res.render('admin/visits', data);
  }

  // ─── Task 7: Stats ─────────────────────────────────

  @Get('stats')
  @UseGuards(AdminGuard)
  async stats(@Req() req: Request, @Res() res: Response) {
    const userId = (req.session as any).userId;

    // Category visit stats
    const categoryVisits = await this.prisma.visit.findMany({
      where: { userId },
      select: { restaurant: { select: { category: true } } },
    });

    const categoryMap = new Map<string, number>();
    categoryVisits.forEach((v) => {
      const cat = v.restaurant.category || '미분류';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    });

    const totalVisits = categoryVisits.length;
    const categoryStats = Array.from(categoryMap.entries())
      .map(([category, count]) => ({
        category,
        count,
        percent: totalVisits > 0 ? Math.round((count / totalVisits) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Top 5 restaurants
    const topRestaurantsRaw = await this.prisma.visit.groupBy({
      by: ['restaurantId'],
      where: { userId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const topRestaurants = await Promise.all(
      topRestaurantsRaw.map(async (r) => {
        const restaurant = await this.prisma.restaurant.findUnique({
          where: { id: r.restaurantId },
          select: { name: true },
        });
        return {
          name: restaurant?.name || '알 수 없음',
          visitCount: r._count.id,
        };
      }),
    );

    // Rating distribution
    const ratingCounts = await this.prisma.visit.groupBy({
      by: ['rating'],
      where: { userId, rating: { not: null } },
      _count: { id: true },
    });

    const totalRatings = ratingCounts.reduce((s, r) => s + r._count.id, 0);
    const ratingOrder = ['AMAZING', 'GOOD', 'OKAY', 'BAD', 'NEVER'];
    const ratingDistribution = ratingOrder.map((rating) => {
      const found = ratingCounts.find((r) => r.rating === rating);
      const count = found ? found._count.id : 0;
      return {
        rating,
        count,
        percent: totalRatings > 0 ? Math.round((count / totalRatings) * 100) : 0,
      };
    });

    return res.render('admin/stats', {
      title: '통계',
      currentPath: '/admin/stats',
      categoryStats,
      topRestaurants,
      ratingDistribution,
      totalRatings,
    });
  }

  // ─── Task 8: Settings & Collection ─────────────────

  @Get('settings')
  @UseGuards(AdminGuard)
  async settings(@Req() req: Request, @Res() res: Response) {
    const userId = (req.session as any).userId;

    const [settings, lastSyncRestaurant, activeCount, inactiveCount] =
      await Promise.all([
        this.prisma.userSettings.findUnique({ where: { userId } }),
        this.prisma.restaurant.findFirst({
          orderBy: { lastSyncedAt: 'desc' },
          select: { lastSyncedAt: true },
        }),
        this.prisma.restaurant.count({ where: { isActive: true } }),
        this.prisma.restaurant.count({ where: { isActive: false } }),
      ]);

    const lastSyncTime = lastSyncRestaurant
      ? lastSyncRestaurant.lastSyncedAt.toLocaleString('ko-KR')
      : null;

    return res.render('admin/settings', {
      title: '설정&수집',
      currentPath: '/admin/settings',
      settings,
      lastSyncTime,
      activeCount,
      inactiveCount,
    });
  }

  @Post('settings')
  @UseGuards(AdminGuard)
  async updateSettings(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
  ) {
    const userId = (req.session as any).userId;

    await this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        latitude: parseFloat(body.latitude),
        longitude: parseFloat(body.longitude),
        walkMinutes: parseInt(body.walkMinutes),
        minRating: parseFloat(body.minRating),
        excludeDays: parseInt(body.excludeDays),
      },
      create: {
        userId,
        latitude: parseFloat(body.latitude),
        longitude: parseFloat(body.longitude),
        walkMinutes: parseInt(body.walkMinutes),
        minRating: parseFloat(body.minRating),
        excludeDays: parseInt(body.excludeDays),
      },
    });

    return res.send(
      '<div class="alert alert-success py-2"><span class="text-sm">설정이 저장되었습니다.</span></div>',
    );
  }
}
