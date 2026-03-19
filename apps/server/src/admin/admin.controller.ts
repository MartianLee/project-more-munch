import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

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
}
