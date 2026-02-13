/**
 * Type Definitions and Constants
 * 
 * This file contains all core type definitions, interfaces, and constants used throughout
 * the A3 Shipping Pro container loading visualization application.
 */

// ============================================================================
// CONTAINER SPECIFICATIONS
// ============================================================================

/**
 * Defines the physical specifications of a shipping container.
 * All measurements are provided in both feet and inches for convenience.
 */
export interface ContainerSpec {
  /** Internal identifier (e.g., '20ft', '40ft', '40hc') */
  name: string;
  
  /** Human-readable display name */
  label: string;
  
  /** Internal length in feet */
  lengthFt: number;
  
  /** Internal width in feet */
  widthFt: number;
  
  /** Internal height in feet */
  heightFt: number;
  
  /** Maximum payload weight capacity in pounds */
  maxWeightLbs: number;
  
  /** Internal length in inches (for precise calculations) */
  lengthIn: number;
  
  /** Internal width in inches (for precise calculations) */
  widthIn: number;
  
  /** Internal height in inches (for precise calculations) */
  heightIn: number;
}

/**
 * Standard shipping container specifications.
 * Based on ISO standard container dimensions with actual internal measurements.
 */
export const CONTAINER_SPECS: Record<string, ContainerSpec> = {
  '20ft': {
    name: '20ft',
    label: "20' Standard",
    lengthFt: 19.33,
    widthFt: 7.71,
    heightFt: 7.87,
    maxWeightLbs: 47900,
    lengthIn: 232,
    widthIn: 92.5,
    heightIn: 94.5,
  },
  '40ft': {
    name: '40ft',
    label: "40' Standard",
    lengthFt: 39.46,
    widthFt: 7.71,
    heightFt: 7.87,
    maxWeightLbs: 58860,
    lengthIn: 473.5,
    widthIn: 92.5,
    heightIn: 94.5,
  },
  '40hc': {
    name: '40hc',
    label: "40' High Cube",
    lengthFt: 39.46,
    widthFt: 7.71,
    heightFt: 8.86,
    maxWeightLbs: 58860,
    lengthIn: 473.5,
    widthIn: 92.5,
    heightIn: 106.3,
  },
};

// ============================================================================
// CARGO ITEM DEFINITIONS
// ============================================================================

/**
 * Categories for cargo items, used for color coding and handling requirements.
 */
export type ItemCategory = 'general' | 'fragile' | 'heavy' | 'hazardous' | 'perishable';

/**
 * Represents a single cargo item in the container.
 * Tracks both current and original dimensions to support rotation operations.
 */
export interface CargoItem {
  /** Unique identifier for the item */
  id: string;
  
  /** Display label/name */
  label: string;
  
  /** Current length in inches (may differ from original after rotation) */
  lengthIn: number;
  
  /** Current width in inches (may differ from original after rotation) */
  widthIn: number;
  
  /** Current height in inches (may differ from original after rotation) */
  heightIn: number;
  
  /** Original length in inches (before any rotations) */
  origLengthIn: number;
  
  /** Original width in inches (before any rotations) */
  origWidthIn: number;
  
  /** Original height in inches (before any rotations) */
  origHeightIn: number;
  
  /** Weight in pounds */
  weightLbs: number;
  
  /** Item category for handling requirements */
  category: ItemCategory;
  
  /** Hex color code for 3D visualization */
  color: string;
  
  /** Position X coordinate in inches (length axis) */
  posX: number;
  
  /** Position Y coordinate in inches (height axis) */
  posY: number;
  
  /** Position Z coordinate in inches (width axis) */
  posZ: number;
  
  /** Whether the item is currently visible in the 3D scene */
  visible: boolean;
  
  /** Rotation state: 0=0°, 1=90°, 2=180°, 3=270° */
  rotationY: number;
}

// ============================================================================
// COLOR MODES AND PALETTES
// ============================================================================

/**
 * Available color modes for visualizing cargo items.
 * - category: Color by cargo category (fragile, heavy, etc.)
 * - weight: Color by weight (gradient from light to heavy)
 * - custom: Each item has its own unique color
 */
export type ColorMode = 'category' | 'weight' | 'custom';

/**
 * Color mapping for item categories.
 * Uses semantic colors: fragile=red, heavy=yellow, perishable=green, etc.
 */
export const CATEGORY_COLORS: Record<ItemCategory, string> = {
  general: '#5b8af5',    // Blue
  fragile: '#f87171',    // Red
  heavy: '#fbbf24',      // Yellow/Amber
  hazardous: '#fb923c',  // Orange
  perishable: '#34d399', // Green
};

/**
 * Weight-based color gradient stops.
 * Used when color mode is set to 'weight' to show lighter items as green,
 * medium as blue, and heavier as yellow/red.
 */
export const WEIGHT_COLOR_STOPS = [
  { threshold: 0, color: '#34d399' },      // 0-500 lbs: Green
  { threshold: 500, color: '#5b8af5' },    // 500-2000 lbs: Blue
  { threshold: 2000, color: '#fbbf24' },   // 2000-5000 lbs: Yellow
  { threshold: 5000, color: '#f87171' },   // 5000+ lbs: Red
];

/**
 * Color palette for custom color mode.
 * Items cycle through this array for visual distinction.
 */
export const ITEM_COLORS = [
  '#5b8af5', '#34d399', '#fbbf24', '#f87171', '#a78bfa',
  '#f472b6', '#22c5d6', '#fb923c', '#818cf8', '#2dd4bf',
  '#fb7185', '#a3e635', '#c084fc', '#22d3ee', '#fdba74',
];

// ============================================================================
// GRID AND SCALING CONSTANTS
// ============================================================================

/**
 * Available grid sizes in inches for snapping functionality.
 * Common divisors of standard pallet dimensions (48x40 inches).
 */
export const GRID_SIZES = [1, 2, 3, 4, 6, 8, 12, 24];

/**
 * Default grid size in inches.
 * 6 inches provides good balance between precision and ease of use.
 */
export const DEFAULT_GRID_SIZE = 6;

/**
 * Scale factor for converting inches to Three.js units.
 * 1 inch = 0.02 Three.js units
 */
export const SCALE_FACTOR = 0.02;

// ============================================================================
// ITEM LIBRARY
// ============================================================================

/**
 * Definition for a library item preset.
 * Used to quickly add common cargo types without manual input.
 */
export interface LibraryItemDef {
  /** Display name */
  name: string;
  
  /** Emoji or symbol for visual identification */
  icon: string;
  
  /** Length in inches */
  lengthIn: number;
  
  /** Width in inches */
  widthIn: number;
  
  /** Height in inches */
  heightIn: number;
  
  /** Weight in pounds */
  weightLbs: number;
  
  /** Item category */
  category: ItemCategory;
  
  /** Grouping for organization in UI (e.g., 'Pallets', 'Boxes') */
  group: string;
}

/**
 * Default library of common shipping items.
 * Includes standard pallets, boxes, drums, machinery, and specialty items.
 * Users can add custom presets which are saved separately.
 */
export const DEFAULT_LIBRARY: LibraryItemDef[] = [
  // ===== PALLETS =====
  { 
    name: 'Standard Pallet (48×40)', 
    icon: '🟫', 
    lengthIn: 48, 
    widthIn: 40, 
    heightIn: 6, 
    weightLbs: 45, 
    category: 'general', 
    group: 'Pallets' 
  },
  { 
    name: 'Euro Pallet (48×32)', 
    icon: '🟫', 
    lengthIn: 48, 
    widthIn: 32, 
    heightIn: 6, 
    weightLbs: 40, 
    category: 'general', 
    group: 'Pallets' 
  },
  { 
    name: 'Half Pallet (24×40)', 
    icon: '🟫', 
    lengthIn: 24, 
    widthIn: 40, 
    heightIn: 6, 
    weightLbs: 25, 
    category: 'general', 
    group: 'Pallets' 
  },

  // ===== BOXES =====
  { 
    name: 'Small Box', 
    icon: '📦', 
    lengthIn: 18, 
    widthIn: 18, 
    heightIn: 18, 
    weightLbs: 30, 
    category: 'general', 
    group: 'Boxes' 
  },
  { 
    name: 'Medium Box', 
    icon: '📦', 
    lengthIn: 24, 
    widthIn: 24, 
    heightIn: 24, 
    weightLbs: 55, 
    category: 'general', 
    group: 'Boxes' 
  },
  { 
    name: 'Large Box', 
    icon: '📦', 
    lengthIn: 36, 
    widthIn: 24, 
    heightIn: 24, 
    weightLbs: 80, 
    category: 'general', 
    group: 'Boxes' 
  },
  { 
    name: 'XL Crate', 
    icon: '📦', 
    lengthIn: 48, 
    widthIn: 40, 
    heightIn: 48, 
    weightLbs: 200, 
    category: 'general', 
    group: 'Boxes' 
  },
  { 
    name: 'Flat Box', 
    icon: '📦', 
    lengthIn: 48, 
    widthIn: 36, 
    heightIn: 12, 
    weightLbs: 65, 
    category: 'general', 
    group: 'Boxes' 
  },

  // ===== DRUMS / BARRELS =====
  { 
    name: '55-Gal Drum', 
    icon: '🛢️', 
    lengthIn: 24, 
    widthIn: 24, 
    heightIn: 36, 
    weightLbs: 484, 
    category: 'heavy', 
    group: 'Drums' 
  },
  { 
    name: '30-Gal Drum', 
    icon: '🛢️', 
    lengthIn: 20, 
    widthIn: 20, 
    heightIn: 30, 
    weightLbs: 265, 
    category: 'heavy', 
    group: 'Drums' 
  },
  { 
    name: 'Chemical Drum', 
    icon: '⚠️', 
    lengthIn: 24, 
    widthIn: 24, 
    heightIn: 36, 
    weightLbs: 500, 
    category: 'hazardous', 
    group: 'Drums' 
  },

  // ===== MACHINERY =====
  { 
    name: 'Small Motor', 
    icon: '⚙️', 
    lengthIn: 30, 
    widthIn: 24, 
    heightIn: 24, 
    weightLbs: 600, 
    category: 'heavy', 
    group: 'Machinery' 
  },
  { 
    name: 'Generator', 
    icon: '⚙️', 
    lengthIn: 48, 
    widthIn: 30, 
    heightIn: 36, 
    weightLbs: 1500, 
    category: 'heavy', 
    group: 'Machinery' 
  },
  { 
    name: 'Compressor', 
    icon: '⚙️', 
    lengthIn: 36, 
    widthIn: 36, 
    heightIn: 42, 
    weightLbs: 2000, 
    category: 'heavy', 
    group: 'Machinery' 
  },

  // ===== FRAGILE ITEMS =====
  { 
    name: 'Electronics Crate', 
    icon: '💻', 
    lengthIn: 36, 
    widthIn: 24, 
    heightIn: 30, 
    weightLbs: 120, 
    category: 'fragile', 
    group: 'Fragile' 
  },
  { 
    name: 'Glass Panels', 
    icon: '🪟', 
    lengthIn: 48, 
    widthIn: 6, 
    heightIn: 72, 
    weightLbs: 350, 
    category: 'fragile', 
    group: 'Fragile' 
  },
  { 
    name: 'Art Crate', 
    icon: '🎨', 
    lengthIn: 60, 
    widthIn: 6, 
    heightIn: 48, 
    weightLbs: 80, 
    category: 'fragile', 
    group: 'Fragile' 
  },

  // ===== PERISHABLE ITEMS =====
  { 
    name: 'Produce Crate', 
    icon: '🍎', 
    lengthIn: 24, 
    widthIn: 18, 
    heightIn: 12, 
    weightLbs: 45, 
    category: 'perishable', 
    group: 'Perishable' 
  },
  { 
    name: 'Cold Box', 
    icon: '❄️', 
    lengthIn: 48, 
    widthIn: 40, 
    heightIn: 42, 
    weightLbs: 300, 
    category: 'perishable', 
    group: 'Perishable' 
  },
  { 
    name: 'Wine Case', 
    icon: '🍷', 
    lengthIn: 20, 
    widthIn: 14, 
    heightIn: 14, 
    weightLbs: 40, 
    category: 'fragile', 
    group: 'Perishable' 
  },

  // ===== FURNITURE =====
  { 
    name: 'Sofa (boxed)', 
    icon: '🛋️', 
    lengthIn: 84, 
    widthIn: 36, 
    heightIn: 36, 
    weightLbs: 180, 
    category: 'general', 
    group: 'Furniture' 
  },
  { 
    name: 'Dining Table', 
    icon: '🪑', 
    lengthIn: 72, 
    widthIn: 42, 
    heightIn: 8, 
    weightLbs: 120, 
    category: 'general', 
    group: 'Furniture' 
  },
  { 
    name: 'Mattress (Queen)', 
    icon: '🛏️', 
    lengthIn: 80, 
    widthIn: 60, 
    heightIn: 12, 
    weightLbs: 85, 
    category: 'general', 
    group: 'Furniture' 
  },
  { 
    name: 'Bookshelf', 
    icon: '📚', 
    lengthIn: 36, 
    widthIn: 12, 
    heightIn: 72, 
    weightLbs: 90, 
    category: 'general', 
    group: 'Furniture' 
  },
];
