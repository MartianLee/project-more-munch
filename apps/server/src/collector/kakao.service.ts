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
          rating: null,
          businessHours: null,
        });
      }
      page++;
    }

    return places;
  }

  async geocode(address: string): Promise<{ latitude: number; longitude: number } | null> {
    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}&size=1`;
    const data = await this.fetchWithRetry(url);
    if (!data?.documents?.length) return null;
    const doc = data.documents[0];
    return { latitude: parseFloat(doc.y), longitude: parseFloat(doc.x) };
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
    const parts = categoryName.split('>').map((s) => s.trim());
    return parts.length > 1 ? parts[parts.length - 1] : null;
  }
}
