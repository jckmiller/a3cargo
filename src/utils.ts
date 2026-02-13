/**
 * Utility Functions
 * 
 * This file contains utility functions for:
 * - Grid snapping and coordinate conversion
 * - Item placement validation
 * - Overlap detection and stacking logic
 * - Container utilization calculations
 * - Item rotation operations
 * - Formatting helpers
 */

import { CargoItem, ContainerSpec, SCALE_FACTOR, DEFAULT_GRID_SIZE } from "./definitions";

// ============================================================================
// COORDINATE AND GRID UTILITIES
// ============================================================================

/**
 * Snaps a value to the nearest grid increment.
 * Used for aligning items to a grid for easier placement.
 * 
 * @param value - Value in inches to snap
 * @param gridSize - Grid size in inches (default: 6")
 * @returns Snapped value to nearest grid increment
 * 
 * @example
 * snapToGrid(17, 6) // Returns 18 (nearest multiple of 6)
 * snapToGrid(25, 12) // Returns 24 (nearest multiple of 12)
 */
export function snapToGrid(value: number, gridSize: number = DEFAULT_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Converts inches to Three.js scene units.
 * The application uses a scale factor to map real-world inches to 3D coordinates.
 * 
 * @param inches - Measurement in inches
 * @returns Equivalent distance in Three.js units
 * 
 * @example
 * inchesToUnits(48) // Returns 0.96 (48 * 0.02)
 */
export function inchesToUnits(inches: number): number {
  return inches * SCALE_FACTOR;
}

/**
 * Converts Three.js scene units back to inches.
 * Inverse of inchesToUnits().
 * 
 * @param units - Distance in Three.js units
 * @returns Equivalent measurement in inches
 * 
 * @example
 * unitsToInches(0.96) // Returns 48 (0.96 / 0.02)
 */
export function unitsToInches(units: number): number {
  return units / SCALE_FACTOR;
}

/**
 * Generates a unique identifier for cargo items.
 * Combines timestamp and random string for collision-resistant IDs.
 * 
 * @returns Unique item ID string (e.g., "item_lx3y9z_a8f2c")
 */
export function generateId(): string {
  return 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
}

// ============================================================================
// VALIDATION AND COLLISION DETECTION
// ============================================================================

/**
 * Result of item placement validation.
 * Contains validity flag and lists of errors and warnings.
 */
export interface ValidationResult {
  /** Whether the placement is valid (no errors) */
  valid: boolean;
  
  /** Non-critical issues (e.g., item is floating) */
  warnings: string[];
  
  /** Critical issues that prevent placement (e.g., overlap, out of bounds) */
  errors: string[];
}

/**
 * Validates whether an item can be placed at its current position.
 * Checks for:
 * - Container boundary violations
 * - Overlaps with other items
 * - Adequate support (not floating)
 * 
 * @param item - Item to validate
 * @param allItems - All items in the container (including the item to validate)
 * @param container - Container specifications
 * @returns ValidationResult with validity status and any issues found
 * 
 * @example
 * const result = validatePlacement(newItem, existingItems, container);
 * if (!result.valid) {
 *   console.error(result.errors); // Handle errors
 * }
 */
export function validatePlacement(
  item: CargoItem,
  allItems: CargoItem[],
  container: ContainerSpec
): ValidationResult {
  const result: ValidationResult = { valid: true, warnings: [], errors: [] };

  // Check container boundaries (with small tolerance for rounding errors)
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

  // Check for overlaps with other items
  for (const other of allItems) {
    if (other.id === item.id) continue;
    if (checkOverlap(item, other)) {
      result.errors.push(`"${item.label}" overlaps with "${other.label}"`);
      result.valid = false;
    }
  }

  // Check if item is adequately supported (not floating)
  if (item.posY > 0) {
    const supported = isSupported(item, allItems);
    if (!supported) {
      result.warnings.push(`"${item.label}" is not fully supported (floating)`);
    }
  }

  return result;
}

/**
 * Checks if two items overlap in 3D space.
 * Uses axis-aligned bounding box (AABB) collision detection with small epsilon
 * to account for floating-point precision.
 * 
 * @param a - First cargo item
 * @param b - Second cargo item
 * @returns true if items overlap, false otherwise
 * 
 * @example
 * if (checkOverlap(item1, item2)) {
 *   console.log("Items collide!");
 * }
 */
export function checkOverlap(a: CargoItem, b: CargoItem): boolean {
  const eps = 0.01; // Small epsilon for floating-point comparisons
  return (
    a.posX < b.posX + b.lengthIn - eps &&
    a.posX + a.lengthIn > b.posX + eps &&
    a.posY < b.posY + b.heightIn - eps &&
    a.posY + a.heightIn > b.posY + eps &&
    a.posZ < b.posZ + b.widthIn - eps &&
    a.posZ + a.widthIn > b.posZ + eps
  );
}

/**
 * Determines if an item has adequate support from items below it.
 * An item is considered supported if at least 40% of its base area overlaps
 * with items directly beneath it.
 * 
 * @param item - Item to check for support
 * @param allItems - All items in the container
 * @returns true if adequately supported, false if floating
 * 
 * @example
 * if (!isSupported(item, allItems)) {
 *   console.warn("Item is floating");
 * }
 */
export function isSupported(item: CargoItem, allItems: CargoItem[]): boolean {
  // Items on the floor are always supported
  if (item.posY <= 0.1) return true;
  
  const baseArea = item.lengthIn * item.widthIn;
  let supportedArea = 0;

  // Find items directly below and calculate overlapping base area
  for (const other of allItems) {
    if (other.id === item.id) continue;
    
    // Check if this item is directly below (within 1 inch tolerance)
    if (Math.abs(other.posY + other.heightIn - item.posY) < 1) {
      // Calculate overlapping area in X direction
      const overlapX = Math.max(0,
        Math.min(item.posX + item.lengthIn, other.posX + other.lengthIn) -
        Math.max(item.posX, other.posX)
      );
      
      // Calculate overlapping area in Z direction
      const overlapZ = Math.max(0,
        Math.min(item.posZ + item.widthIn, other.posZ + other.widthIn) -
        Math.max(item.posZ, other.posZ)
      );
      
      supportedArea += overlapX * overlapZ;
    }
  }

  // Require at least 40% of base to be supported
  return supportedArea >= baseArea * 0.4;
}

// ============================================================================
// STACKING LOGIC
// ============================================================================

/**
 * Finds the optimal Y position (height) for stacking an item.
 * Searches for the highest position where the item can be placed without
 * exceeding container height, preferring to stack on other items when possible.
 * 
 * @param item - Item to find stacking position for
 * @param allItems - All items currently in container
 * @param container - Container specifications
 * @returns Object with Y position and the item being stacked on (if any)
 * 
 * @example
 * const { y, stackedOn } = findStackingY(newItem, items, container);
 * newItem.posY = y;
 * if (stackedOn) console.log(`Stacking on ${stackedOn.label}`);
 */
export function findStackingY(
  item: CargoItem,
  allItems: CargoItem[],
  container: ContainerSpec
): { y: number; stackedOn: CargoItem | null } {
  let bestY = 0; // Default to floor
  let stackedOn: CargoItem | null = null;

  // Check each existing item for potential stacking
  for (const other of allItems) {
    if (other.id === item.id) continue;

    // Calculate horizontal overlap in X direction
    const overlapX = Math.min(item.posX + item.lengthIn, other.posX + other.lengthIn) -
                     Math.max(item.posX, other.posX);
    
    // Calculate horizontal overlap in Z direction
    const overlapZ = Math.min(item.posZ + item.widthIn, other.posZ + other.widthIn) -
                     Math.max(item.posZ, other.posZ);

    // If there's significant horizontal overlap, consider stacking
    if (overlapX > 0.5 && overlapZ > 0.5) {
      const topY = other.posY + other.heightIn;
      
      // Use this level if it's higher and item will fit
      if (topY > bestY && topY + item.heightIn <= container.heightIn + 0.5) {
        bestY = topY;
        stackedOn = other;
      }
    }
  }

  return { y: bestY, stackedOn };
}

/**
 * Finds all possible horizontal stacking levels for an item.
 * Returns sorted array of Y positions where item could potentially be placed,
 * including floor (0) and tops of all compatible items.
 * 
 * @param item - Item to find stack levels for
 * @param allItems - All items in container
 * @param container - Container specifications
 * @returns Sorted array of possible Y positions in inches
 * 
 * @example
 * const levels = findAllStackLevels(item, items, container);
 * // levels might be [0, 12, 24, 48] representing floor and item tops
 */
export function findAllStackLevels(
  item: CargoItem,
  allItems: CargoItem[],
  container: ContainerSpec
): number[] {
  const levels = new Set<number>();
  levels.add(0); // Always include floor level

  // Add top surface of each item as potential level
  for (const other of allItems) {
    if (other.id === item.id) continue;
    const topY = other.posY + other.heightIn;
    
    // Only include if item would fit below container ceiling
    if (topY + item.heightIn <= container.heightIn + 0.5) {
      levels.add(topY);
    }
  }

  return Array.from(levels).sort((a, b) => a - b);
}

// ============================================================================
// CALCULATIONS AND MEASUREMENTS
// ============================================================================

/**
 * Calculates the percentage of container volume occupied by items.
 * 
 * @param items - Array of cargo items
 * @param container - Container specifications
 * @returns Utilization percentage (0-100+)
 * 
 * @example
 * const util = calculateUtilization(items, container);
 * console.log(`Container is ${util.toFixed(1)}% full`);
 */
export function calculateUtilization(items: CargoItem[], container: ContainerSpec): number {
  const containerVolume = container.lengthIn * container.widthIn * container.heightIn;
  const itemsVolume = items.reduce((sum, item) => {
    return sum + item.lengthIn * item.widthIn * item.heightIn;
  }, 0);
  return (itemsVolume / containerVolume) * 100;
}

/**
 * Calculates the total weight of all items in the container.
 * 
 * @param items - Array of cargo items
 * @returns Total weight in pounds
 * 
 * @example
 * const totalWeight = calculateTotalWeight(items);
 * console.log(`Total: ${totalWeight} lbs`);
 */
export function calculateTotalWeight(items: CargoItem[]): number {
  return items.reduce((sum, item) => sum + item.weightLbs, 0);
}

/**
 * Calculates weight distribution across the container.
 * Divides container into quadrants and reports percentage of weight in each.
 * Useful for identifying balance issues that could cause shipping problems.
 * 
 * @param items - Array of cargo items
 * @param container - Container specifications
 * @returns Object with percentage of weight in front, back, left, and right halves
 * 
 * @example
 * const dist = getWeightDistribution(items, container);
 * if (Math.abs(dist.front - dist.back) > 20) {
 *   console.warn("Unbalanced front/back weight!");
 * }
 */
export function getWeightDistribution(
  items: CargoItem[], 
  container: ContainerSpec
): { front: number; back: number; left: number; right: number } {
  const midLength = container.lengthIn / 2;
  const midWidth = container.widthIn / 2;
  let front = 0, back = 0, left = 0, right = 0;
  let totalW = 0;

  // Classify each item's weight based on its center position
  for (const item of items) {
    const centerX = item.posX + item.lengthIn / 2;
    const centerZ = item.posZ + item.widthIn / 2;
    
    // Front/back distribution (X axis)
    if (centerX < midLength) front += item.weightLbs;
    else back += item.weightLbs;
    
    // Left/right distribution (Z axis)
    if (centerZ < midWidth) left += item.weightLbs;
    else right += item.weightLbs;
    
    totalW += item.weightLbs;
  }

  // Handle empty container case
  if (totalW === 0) return { front: 50, back: 50, left: 50, right: 50 };

  // Convert to percentages
  return {
    front: (front / totalW) * 100,
    back: (back / totalW) * 100,
    left: (left / totalW) * 100,
    right: (right / totalW) * 100,
  };
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Formats weight for compact display.
 * Converts large weights to "k" notation (e.g., 1500 → "1.5k").
 * 
 * @param lbs - Weight in pounds
 * @returns Formatted weight string
 * 
 * @example
 * formatWeight(450)  // Returns "450"
 * formatWeight(1500) // Returns "1.5k"
 */
export function formatWeight(lbs: number): string {
  if (lbs >= 1000) return (lbs / 1000).toFixed(1) + 'k';
  return lbs.toFixed(0);
}

/**
 * Formats item dimensions as a readable string.
 * Uses the × symbol for professional appearance.
 * 
 * @param l - Length in inches
 * @param w - Width in inches
 * @param h - Height in inches
 * @returns Formatted dimension string
 * 
 * @example
 * formatDimensions(48, 40, 36) // Returns '48" × 40" × 36"'
 */
export function formatDimensions(l: number, w: number, h: number): string {
  return `${l}" × ${w}" × ${h}"`;
}

/**
 * Returns a color based on item weight.
 * Used for weight-based color coding visualization.
 * 
 * @param weight - Weight in pounds
 * @returns Hex color code
 * 
 * @example
 * getWeightColor(250)  // Returns '#34d399' (green - light)
 * getWeightColor(1500) // Returns '#5b8af5' (blue - medium)
 * getWeightColor(6000) // Returns '#f87171' (red - heavy)
 */
export function getWeightColor(weight: number): string {
  if (weight < 500) return '#34d399';   // Green: light
  if (weight < 2000) return '#5b8af5';  // Blue: medium
  if (weight < 5000) return '#fbbf24';  // Yellow: heavy
  return '#f87171';                      // Red: very heavy
}

// ============================================================================
// ROTATION OPERATIONS
// ============================================================================

/**
 * Rotates an item 90 degrees horizontally (around Y axis).
 * Swaps length and width dimensions and updates rotation counter.
 * This is the most common rotation for optimizing fit.
 * 
 * @param item - Item to rotate (modified in place)
 * 
 * @example
 * // Item is 48"L × 40"W × 36"H
 * rotateItemY(item);
 * // Now 40"L × 48"W × 36"H (rotated 90°)
 */
export function rotateItemY(item: CargoItem): void {
  const oldLength = item.lengthIn;
  const oldWidth = item.widthIn;
  item.lengthIn = oldWidth;
  item.widthIn = oldLength;
  item.rotationY = (item.rotationY + 1) % 4; // 0-3 representing 0°, 90°, 180°, 270°
}

/**
 * Tips an item forward, swapping length and height.
 * Useful for standing tall items on their side or vice versa.
 * This is a less common operation, typically used for oddly-shaped items.
 * 
 * @param item - Item to tip (modified in place)
 * 
 * @example
 * // Item is 60"L × 12"W × 72"H (tall bookshelf)
 * rotateItemTipForward(item);
 * // Now 72"L × 12"W × 60"H (laid on its back)
 */
export function rotateItemTipForward(item: CargoItem): void {
  const oldLength = item.lengthIn;
  const oldHeight = item.heightIn;
  item.lengthIn = oldHeight;
  item.heightIn = oldLength;
}

/**
 * Tips an item sideways, swapping width and height.
 * Another way to reorient tall or wide items for better fit.
 * 
 * @param item - Item to tip (modified in place)
 * 
 * @example
 * // Item is 24"L × 48"W × 12"H (wide flat box)
 * rotateItemTipSide(item);
 * // Now 24"L × 12"W × 48"H (standing on edge)
 */
export function rotateItemTipSide(item: CargoItem): void {
  const oldWidth = item.widthIn;
  const oldHeight = item.heightIn;
  item.widthIn = oldHeight;
  item.heightIn = oldWidth;
}

/**
 * Gets a display label for the item's current rotation state.
 * Returns empty string if item is in original orientation, otherwise
 * returns degree notation (e.g., "90°", "180°").
 * 
 * @param item - Item to get rotation label for
 * @returns Rotation label string or empty string
 * 
 * @example
 * getRotationLabel(item) // Returns "90°" if rotated once
 * getRotationLabel(item) // Returns "" if in original position
 */
export function getRotationLabel(item: CargoItem): string {
  const deg = item.rotationY * 90;
  
  // Check if dimensions have changed from original (including tipping operations)
  const dimChanged = item.lengthIn !== item.origLengthIn ||
                     item.widthIn !== item.origWidthIn ||
                     item.heightIn !== item.origHeightIn;
  
  // Only show label if actually rotated or dimensions changed
  if (!dimChanged && deg === 0) return '';
  return `${deg}°`;
}
