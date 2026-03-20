import { Injectable } from '@nestjs/common';
import { latLngToCell, gridDisk, cellToLatLng, cellToChildren } from 'h3-js';

export interface SearchCell {
  h3Index: string;
  lat: number;
  lng: number;
}

const H3_RESOLUTION = 8;
const H3_FINE_RESOLUTION = 9;
const H3_EDGE_LENGTH_M = 531;

@Injectable()
export class H3GridService {
  refineSaturatedCells(saturatedH3Indexes: string[]): SearchCell[] {
    const childCells: SearchCell[] = [];
    for (const parentIndex of saturatedH3Indexes) {
      const children = cellToChildren(parentIndex, H3_FINE_RESOLUTION);
      for (const childIndex of children) {
        const [lat, lng] = cellToLatLng(childIndex);
        childCells.push({ h3Index: childIndex, lat, lng });
      }
    }
    return childCells;
  }

  getSearchCells(lat: number, lng: number, radiusM: number): SearchCell[] {
    const centerCell = latLngToCell(lat, lng, H3_RESOLUTION);
    const k = Math.max(1, Math.ceil(radiusM / (H3_EDGE_LENGTH_M * 2)));
    const cells = gridDisk(centerCell, k);

    return cells.map((h3Index) => {
      const [cellLat, cellLng] = cellToLatLng(h3Index);
      return { h3Index, lat: cellLat, lng: cellLng };
    });
  }
}
