
import { CargoItem, ContainerSpec, SCALE_FACTOR, DEFAULT_GRID_SIZE } from "./definitions";

export function snapToGrid(value: number, gridSize: number = DEFAULT_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export function inchesToUnits(inches: number): number {
  return inches * SCALE_FACTOR;
}

export function unitsToInches(units: number): number {
  return units / SCALE_FACTOR;
}

export function generateId(): string {
  return 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export function validatePlacement(
  item: CargoItem,
  allItems: CargoItem[],
  container: ContainerSpec
): ValidationResult {
  const result: ValidationResult = { valid: true, warnings: [], errors: [] };

  if (item.posX < 0 || item.posX + item.lengthIn > container.lengthIn + 0.5) {
    result.errors.push(`"${item.label}" exceeds container length boundary`);
    result.valid = false;
  }
  if (item.posZ < 0 || item.posZ + item.widthIn > container.widthIn + 0.5) {
    result.errors.push(`"${item.label}" exceeds container width boundary`);
    result.valid = false;
  }
  if (item.posY < 0 || item.posY + item.heightIn > container.heightIn + 0.5) {
    result.errors.push(`"${item.label}" exceeds container height boundary`);
    result.valid = false;
  }

  for (const other of allItems) {
    if (other.id === item.id) continue;
    if (checkOverlap(item, other)) {
      result.errors.push(`"${item.label}" overlaps with "${other.label}"`);
      result.valid = false;
    }
  }

  if (item.posY > 0) {
    const supported = isSupported(item, allItems);
    if (!supported) {
      result.warnings.push(`"${item.label}" is not fully supported (floating)`);
    }
  }

  return result;
}

export function checkOverlap(a: CargoItem, b: CargoItem): boolean {
  const eps = 0.01;
  return (
    a.posX < b.posX + b.lengthIn - eps &&
    a.posX + a.lengthIn > b.posX + eps &&
    a.posY < b.posY + b.heightIn - eps &&
    a.posY + a.heightIn > b.posY + eps &&
    a.posZ < b.posZ + b.widthIn - eps &&
    a.posZ + a.widthIn > b.posZ + eps
  );
}

export function isSupported(item: CargoItem, allItems: CargoItem[]): boolean {
  if (item.posY <= 0.1) return true;
  
  const baseArea = item.lengthIn * item.widthIn;
  let supportedArea = 0;

  for (const other of allItems) {
    if (other.id === item.id) continue;
    if (Math.abs(other.posY + other.heightIn - item.posY) < 1) {
      const overlapX = Math.max(0,
        Math.min(item.posX + item.lengthIn, other.posX + other.lengthIn) -
        Math.max(item.posX, other.posX)
      );
      const overlapZ = Math.max(0,
        Math.min(item.posZ + item.widthIn, other.posZ + other.widthIn) -
        Math.max(item.posZ, other.posZ)
      );
      supportedArea += overlapX * overlapZ;
    }
  }

  return supportedArea >= baseArea * 0.4;
}

export function findStackingY(
  item: CargoItem,
  allItems: CargoItem[],
  container: ContainerSpec
): { y: number; stackedOn: CargoItem | null } {
  let bestY = 0;
  let stackedOn: CargoItem | null = null;

  for (const other of allItems) {
    if (other.id === item.id) continue;

    const overlapX = Math.min(item.posX + item.lengthIn, other.posX + other.lengthIn) -
                     Math.max(item.posX, other.posX);
    const overlapZ = Math.min(item.posZ + item.widthIn, other.posZ + other.widthIn) -
                     Math.max(item.posZ, other.posZ);

    if (overlapX > 0.5 && overlapZ > 0.5) {
      const topY = other.posY + other.heightIn;
      if (topY > bestY && topY + item.heightIn <= container.heightIn + 0.5) {
        bestY = topY;
        stackedOn = other;
      }
    }
  }

  return { y: bestY, stackedOn };
}

export function findAllStackLevels(
  item: CargoItem,
  allItems: CargoItem[],
  container: ContainerSpec
): number[] {
  const levels = new Set<number>();
  levels.add(0);

  for (const other of allItems) {
    if (other.id === item.id) continue;
    const topY = other.posY + other.heightIn;
    if (topY + item.heightIn <= container.heightIn + 0.5) {
      levels.add(topY);
    }
  }

  return Array.from(levels).sort((a, b) => a - b);
}

export function calculateUtilization(items: CargoItem[], container: ContainerSpec): number {
  const containerVolume = container.lengthIn * container.widthIn * container.heightIn;
  const itemsVolume = items.reduce((sum, item) => {
    return sum + item.lengthIn * item.widthIn * item.heightIn;
  }, 0);
  return (itemsVolume / containerVolume) * 100;
}

export function calculateTotalWeight(items: CargoItem[]): number {
  return items.reduce((sum, item) => sum + item.weightLbs, 0);
}

export function getWeightDistribution(items: CargoItem[], container: ContainerSpec): { front: number; back: number; left: number; right: number } {
  const midLength = container.lengthIn / 2;
  const midWidth = container.widthIn / 2;
  let front = 0, back = 0, left = 0, right = 0;
  let totalW = 0;

  for (const item of items) {
    const centerX = item.posX + item.lengthIn / 2;
    const centerZ = item.posZ + item.widthIn / 2;
    
    if (centerX < midLength) front += item.weightLbs;
    else back += item.weightLbs;
    
    if (centerZ < midWidth) left += item.weightLbs;
    else right += item.weightLbs;
    
    totalW += item.weightLbs;
  }

  if (totalW === 0) return { front: 50, back: 50, left: 50, right: 50 };

  return {
    front: (front / totalW) * 100,
    back: (back / totalW) * 100,
    left: (left / totalW) * 100,
    right: (right / totalW) * 100,
  };
}

export function formatWeight(lbs: number): string {
  if (lbs >= 1000) return (lbs / 1000).toFixed(1) + 'k';
  return lbs.toFixed(0);
}

export function formatDimensions(l: number, w: number, h: number): string {
  return `${l}" × ${w}" × ${h}"`;
}

export function getWeightColor(weight: number): string {
  if (weight < 500) return '#34d399';
  if (weight < 2000) return '#5b8af5';
  if (weight < 5000) return '#fbbf24';
  return '#f87171';
}

export function rotateItemY(item: CargoItem): void {
  const oldLength = item.lengthIn;
  const oldWidth = item.widthIn;
  item.lengthIn = oldWidth;
  item.widthIn = oldLength;
  item.rotationY = (item.rotationY + 1) % 4;
}

export function rotateItemTipForward(item: CargoItem): void {
  const oldLength = item.lengthIn;
  const oldHeight = item.heightIn;
  item.lengthIn = oldHeight;
  item.heightIn = oldLength;
}

export function rotateItemTipSide(item: CargoItem): void {
  const oldWidth = item.widthIn;
  const oldHeight = item.heightIn;
  item.widthIn = oldHeight;
  item.heightIn = oldWidth;
}

export function getRotationLabel(item: CargoItem): string {
  const deg = item.rotationY * 90;
  const dimChanged = item.lengthIn !== item.origLengthIn ||
                     item.widthIn !== item.origWidthIn ||
                     item.heightIn !== item.origHeightIn;
  if (!dimChanged && deg === 0) return '';
  return `${deg}°`;
}
