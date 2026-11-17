import { expect, it } from 'vitest';
import { hitVehicle, nextDeliveryStop, type VehicleInfo } from './vehicleInspection';
const truck: VehicleInfo = { key: 'truck', kind: 'freight', name: 'Truck', colour: 1, x: 50, y: 50, angle: Math.PI / 2,
  length: 16, width: 7, visible: true, cell: { x: 1, y: 1 }, destination: { x: 2, y: 2 }, returning: false, activity: 'moving', progress: 0.5, held: 0 };
it('hits the rotated vehicle body and ignores invisible cars or unrelated pedestrians', () => {
  expect(hitVehicle([truck], 50, 58, 1)?.key).toBe('truck');
  expect(hitVehicle([truck], 63, 50, 1)).toBeUndefined();
  expect(hitVehicle([{ ...truck, visible: false }], 50, 50, 1)).toBeUndefined();
  expect(hitVehicle([truck, { ...truck, key: 'closer', y: 57 }], 50, 57, 1)?.key).toBe('closer');
});
it('reports the next ordered delivery stop and sends returning trucks back to the factory', () => {
  const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
  const access = (cell: { x: number; y: number }) => ({ x: cell.x, y: 0 });
  expect(nextDeliveryStop(path, [128, 129, 131], 0, false, access, 128)).toEqual({ x: 1, y: 1 });
  expect(nextDeliveryStop(path, [128, 129, 131], 1.2, false, access, 128)).toEqual({ x: 3, y: 1 });
  expect(nextDeliveryStop(path, [128, 129, 131], 1.2, true, access, 128)).toEqual({ x: 0, y: 1 });
});
