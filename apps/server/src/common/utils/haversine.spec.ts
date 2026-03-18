import { haversineDistance, walkingMinutes } from './haversine';

describe('haversine', () => {
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
    expect(walkingMinutes(120)).toBe(2);
  });
});
