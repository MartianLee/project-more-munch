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
          title: item.title.replace(/<[^>]*>/g, ''),
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
