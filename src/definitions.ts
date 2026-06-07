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

// ============================================================================
// HAZMAT CLASSIFICATION
// ============================================================================

/**
 * UN/DOT hazardous materials classes.
 * 'none' means the item is not classified as hazmat.
 */
export type HazmatLevel =
  | 'none'
  | '1-explosives'
  | '2-gas'
  | '3-flammable-liquid'
  | '4-flammable-solid'
  | '5-oxidizer'
  | '6-toxic'
  | '7-radioactive'
  | '8-corrosive'
  | '9-miscellaneous';

/**
 * Metadata for each UN/DOT hazmat class.
 * color is the standard placard background color (hex).
 */
export interface HazmatClassInfo {
  label: string;
  /** Short display label for UI */
  shortLabel: string;
  /** Standard placard background color (hex string) */
  color: string;
  /** Contrasting text/symbol color (hex string) */
  textColor: string;
  /** UN class number (1–9) */
  classNum: number;
}

export const HAZMAT_CLASSES: Record<HazmatLevel, HazmatClassInfo> = {
  'none':               { label: 'None',                    shortLabel: '-',    color: '#cccccc', textColor: '#333333', classNum: 0 },
  '1-explosives':       { label: 'Class 1 – Explosives',    shortLabel: 'Cl.1', color: '#ff6600', textColor: '#ffffff', classNum: 1 },
  '2-gas':              { label: 'Class 2 – Gas',           shortLabel: 'Cl.2', color: '#33aa33', textColor: '#ffffff', classNum: 2 },
  '3-flammable-liquid': { label: 'Class 3 – Flammable Liq', shortLabel: 'Cl.3', color: '#cc0000', textColor: '#ffffff', classNum: 3 },
  '4-flammable-solid':  { label: 'Class 4 – Flammable Solid',shortLabel: 'Cl.4',color: '#ff4444', textColor: '#ffffff', classNum: 4 },
  '5-oxidizer':         { label: 'Class 5 – Oxidizer',      shortLabel: 'Cl.5', color: '#ffdd00', textColor: '#000000', classNum: 5 },
  '6-toxic':            { label: 'Class 6 – Toxic',         shortLabel: 'Cl.6', color: '#ffffff', textColor: '#000000', classNum: 6 },
  '7-radioactive':      { label: 'Class 7 – Radioactive',   shortLabel: 'Cl.7', color: '#ffee33', textColor: '#000000', classNum: 7 },
  '8-corrosive':        { label: 'Class 8 – Corrosive',     shortLabel: 'Cl.8', color: '#000000', textColor: '#ffffff', classNum: 8 },
  '9-miscellaneous':    { label: 'Class 9 – Miscellaneous', shortLabel: 'Cl.9', color: '#888888', textColor: '#ffffff', classNum: 9 },
};

/**
 * Stacking rule — either allow all categories, allow none, or allow a specific subset.
 */
export type StackingRule = 'all' | 'none' | ItemCategory[];

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

  /**
   * Which item categories are allowed to be stacked ON TOP of this item.
   * - 'all'  → any item may stack on top (default)
   * - 'none' → nothing may be placed on top of this item
   * - ItemCategory[] → only items whose category is in the list may stack on top
   */
  acceptsOnTop: StackingRule;

  /**
   * Which item categories this item is allowed to sit on top of.
   * - 'all'  → this item may be placed on any item (default)
   * - 'none' → this item may only be placed on the floor
   * - ItemCategory[] → this item may only be stacked on items whose category is in the list
   */
  canStackOn: StackingRule;

  /** UN/DOT hazmat classification level. Defaults to 'none'. */
  hazmatLevel?: HazmatLevel;
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

  /** Which categories may stack on top of this item (optional, defaults to 'all') */
  acceptsOnTop?: StackingRule;

  /** Which categories this item may be stacked on top of (optional, defaults to 'all') */
  canStackOn?: StackingRule;

  /** UN/DOT hazmat classification level (optional, defaults to 'none') */
  hazmatLevel?: HazmatLevel;
}

/**
 * Default library — Industrial presets only.
 * Users can add custom presets which are saved separately.
 */
export const DEFAULT_LIBRARY: LibraryItemDef[] = [
  // ===== INDUSTRIAL =====
  {
    name: 'SurePak',
    icon: '📦',
    lengthIn: 48,
    widthIn: 40,
    heightIn: 45,
    weightLbs: 60,
    category: 'general',
    group: 'Industrial',
  },
  {
    name: 'Blade Container',
    icon: '📐',
    lengthIn: 303,
    widthIn: 38,
    heightIn: 18,
    weightLbs: 500,
    category: 'heavy',
    group: 'Industrial',
  },
  {
    name: 'Sheet Metal Crate',
    icon: '🔩',
    lengthIn: 152,
    widthIn: 53,
    heightIn: 8,
    weightLbs: 400,
    category: 'heavy',
    group: 'Industrial',
  },
];

// ============================================================================
// SAVE/LOAD FILE FORMAT
// ============================================================================

/**
 * Represents a saved container load configuration.
 * Can be exported to a file and later imported to restore the exact state.
 */
export interface SavedLoad {
  /** File format version for compatibility checking */
  version: string;
  
  /** Container type identifier */
  containerType: string;
  
  /** Array of all cargo items with their positions and properties */
  items: CargoItem[];
  
  /** Optional user preferences */
  preferences?: {
    gridSize?: number;
    colorMode?: ColorMode;
    snapEnabled?: boolean;
  };
  
  /** ISO timestamp of when the load was exported */
  exportDate: string;
  
  /** Optional user-provided name/description for the load */
  loadName?: string;
}
