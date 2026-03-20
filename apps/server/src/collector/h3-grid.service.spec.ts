import { H3GridService } from './h3-grid.service';

describe('H3GridService', () => {
  let service: H3GridService;

  beforeEach(() => {
    service = new H3GridService();
  });

  describe('getSearchCells', () => {
    it('서울 시청 기준 해상도 8 셀 목록을 반환한다', () => {
      const cells = service.getSearchCells(37.5666, 126.9784, 800);
      expect(cells.length).toBeGreaterThanOrEqual(3);
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
