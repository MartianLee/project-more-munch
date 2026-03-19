import { Injectable, Logger } from '@nestjs/common';

export interface CollectedMenu {
  name: string;
  price: number | null;
}

@Injectable()
export class MenuCollectorService {
  private readonly logger = new Logger(MenuCollectorService.name);

  async fetchMenus(kakaoId: string): Promise<CollectedMenu[]> {
    try {
      const url = `https://place.map.kakao.com/main/v/${kakaoId}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (!res.ok) {
        this.logger.warn(`Kakao Place API error: ${res.status} for ${kakaoId}`);
        return [];
      }

      const data = await res.json();
      const menuList = data?.menuInfo?.menuList;
      if (!Array.isArray(menuList) || menuList.length === 0) {
        return [];
      }

      return menuList.map((item: any) => ({
        name: item.menu ?? item.name ?? '',
        price: this.parsePrice(item.price),
      })).filter((m: CollectedMenu) => m.name);
    } catch (error) {
      this.logger.warn(`Failed to fetch menus for kakaoId ${kakaoId}`, (error as Error).message);
      return [];
    }
  }

  private parsePrice(raw: string | number | null | undefined): number | null {
    if (raw == null) return null;
    const num = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
    return isNaN(num) ? null : num;
  }
}
