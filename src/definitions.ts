
export interface ContainerSpec {
  name: string;
  label: string;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  maxWeightLbs: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}

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

export type ItemCategory = 'general' | 'fragile' | 'heavy' | 'hazardous' | 'perishable';

export interface CargoItem {
  id: string;
  label: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  origLengthIn: number;
  origWidthIn: number;
  origHeightIn: number;
  weightLbs: number;
  category: ItemCategory;
  color: string;
  posX: number;
  posY: number;
  posZ: number;
  visible: boolean;
  rotationY: number;
}

export type ColorMode = 'category' | 'weight' | 'custom';

export const CATEGORY_COLORS: Record<ItemCategory, string> = {
  general: '#5b8af5',
  fragile: '#f87171',
  heavy: '#fbbf24',
  hazardous: '#fb923c',
  perishable: '#34d399',
};

export const WEIGHT_COLOR_STOPS = [
  { threshold: 0, color: '#34d399' },
  { threshold: 500, color: '#5b8af5' },
  { threshold: 2000, color: '#fbbf24' },
  { threshold: 5000, color: '#f87171' },
];

export const ITEM_COLORS = [
  '#5b8af5', '#34d399', '#fbbf24', '#f87171', '#a78bfa',
  '#f472b6', '#22c5d6', '#fb923c', '#818cf8', '#2dd4bf',
  '#fb7185', '#a3e635', '#c084fc', '#22d3ee', '#fdba74',
];

export const GRID_SIZES = [1, 2, 3, 4, 6, 8, 12, 24];
export const DEFAULT_GRID_SIZE = 6;
export const SCALE_FACTOR = 0.02;

// ===== ITEM LIBRARY =====

export interface LibraryItemDef {
  name: string;
  icon: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLbs: number;
  category: ItemCategory;
  group: string;
}

export const DEFAULT_LIBRARY: LibraryItemDef[] = [
  // Pallets
  { name: 'Standard Pallet (48×40)', icon: '🟫', lengthIn: 48, widthIn: 40, heightIn: 6, weightLbs: 45, category: 'general', group: 'Pallets' },
  { name: 'Euro Pallet (48×32)', icon: '🟫', lengthIn: 48, widthIn: 32, heightIn: 6, weightLbs: 40, category: 'general', group: 'Pallets' },
  { name: 'Half Pallet (24×40)', icon: '🟫', lengthIn: 24, widthIn: 40, heightIn: 6, weightLbs: 25, category: 'general', group: 'Pallets' },

  // Boxes
  { name: 'Small Box', icon: '📦', lengthIn: 18, widthIn: 18, heightIn: 18, weightLbs: 30, category: 'general', group: 'Boxes' },
  { name: 'Medium Box', icon: '📦', lengthIn: 24, widthIn: 24, heightIn: 24, weightLbs: 55, category: 'general', group: 'Boxes' },
  { name: 'Large Box', icon: '📦', lengthIn: 36, widthIn: 24, heightIn: 24, weightLbs: 80, category: 'general', group: 'Boxes' },
  { name: 'XL Crate', icon: '📦', lengthIn: 48, widthIn: 40, heightIn: 48, weightLbs: 200, category: 'general', group: 'Boxes' },
  { name: 'Flat Box', icon: '📦', lengthIn: 48, widthIn: 36, heightIn: 12, weightLbs: 65, category: 'general', group: 'Boxes' },

  // Drums / Barrels
  { name: '55-Gal Drum', icon: '🛢️', lengthIn: 24, widthIn: 24, heightIn: 36, weightLbs: 484, category: 'heavy', group: 'Drums' },
  { name: '30-Gal Drum', icon: '🛢️', lengthIn: 20, widthIn: 20, heightIn: 30, weightLbs: 265, category: 'heavy', group: 'Drums' },
  { name: 'Chemical Drum', icon: '⚠️', lengthIn: 24, widthIn: 24, heightIn: 36, weightLbs: 500, category: 'hazardous', group: 'Drums' },

  // Machinery
  { name: 'Small Motor', icon: '⚙️', lengthIn: 30, widthIn: 24, heightIn: 24, weightLbs: 600, category: 'heavy', group: 'Machinery' },
  { name: 'Generator', icon: '⚙️', lengthIn: 48, widthIn: 30, heightIn: 36, weightLbs: 1500, category: 'heavy', group: 'Machinery' },
  { name: 'Compressor', icon: '⚙️', lengthIn: 36, widthIn: 36, heightIn: 42, weightLbs: 2000, category: 'heavy', group: 'Machinery' },

  // Fragile
  { name: 'Electronics Crate', icon: '💻', lengthIn: 36, widthIn: 24, heightIn: 30, weightLbs: 120, category: 'fragile', group: 'Fragile' },
  { name: 'Glass Panels', icon: '🪟', lengthIn: 48, widthIn: 6, heightIn: 72, weightLbs: 350, category: 'fragile', group: 'Fragile' },
  { name: 'Art Crate', icon: '🎨', lengthIn: 60, widthIn: 6, heightIn: 48, weightLbs: 80, category: 'fragile', group: 'Fragile' },

  // Perishable
  { name: 'Produce Crate', icon: '🍎', lengthIn: 24, widthIn: 18, heightIn: 12, weightLbs: 45, category: 'perishable', group: 'Perishable' },
  { name: 'Cold Box', icon: '❄️', lengthIn: 48, widthIn: 40, heightIn: 42, weightLbs: 300, category: 'perishable', group: 'Perishable' },
  { name: 'Wine Case', icon: '🍷', lengthIn: 20, widthIn: 14, heightIn: 14, weightLbs: 40, category: 'fragile', group: 'Perishable' },

  // Furniture
  { name: 'Sofa (boxed)', icon: '🛋️', lengthIn: 84, widthIn: 36, heightIn: 36, weightLbs: 180, category: 'general', group: 'Furniture' },
  { name: 'Dining Table', icon: '🪑', lengthIn: 72, widthIn: 42, heightIn: 8, weightLbs: 120, category: 'general', group: 'Furniture' },
  { name: 'Mattress (Queen)', icon: '🛏️', lengthIn: 80, widthIn: 60, heightIn: 12, weightLbs: 85, category: 'general', group: 'Furniture' },
  { name: 'Bookshelf', icon: '📚', lengthIn: 36, widthIn: 12, heightIn: 72, weightLbs: 90, category: 'general', group: 'Furniture' },
];
