
/**
 * User Interface Layer
 * 
 * Handles all UI generation and user interaction for the A3 Shipping Pro application.
 * This file manages:
 * - UI component creation (panels, tabs, forms, buttons)
 * - Event listener setup
 * - Modal dialogs (manifest, load plan, edit item)
 * - Item library management
 * - Statistics display and updates
 * - Toast notifications
 * - Item list rendering
 * 
 * The UI is built programmatically in JavaScript for maximum flexibility.
 * It uses a callback pattern to communicate user actions back to the main app.
 */

import {
  ContainerSpec,
  CONTAINER_SPECS,
  CargoItem,
  ItemCategory,
  CATEGORY_COLORS,
  ITEM_COLORS,
  ColorMode,
  LibraryItemDef,
  DEFAULT_LIBRARY,
  GRID_SIZES,
  DEFAULT_GRID_SIZE,
  StackingRule,
  HazmatLevel,
  HAZMAT_CLASSES,
  SavedLoad,
} from "./definitions";
import {
  calculateUtilization,
  calculateTotalWeight,
  getWeightDistribution,
  formatDimensions,
  getWeightColor,
  getRotationLabel,
  ValidationResult,
  stackingRuleLabel,
} from "./utils";
import { persistence } from "./libs/persistence";
import {
  AuthUser,
  UserSummary,
  apiListProjects,
  apiCreateProject,
  apiUpdateProject,
  apiDeleteProject,
  apiGetProject,
  apiListUsers,
  apiCreateUser,
  apiUpdateUserRole,
  apiDeleteUser,
  ProjectSummary,
} from "./libs/api";
import { logout } from "./auth";
import { loadLogoDataUrl, getLogoDataUrl } from "./logo";

// ============================================================================
// UI CALLBACK INTERFACE
// ============================================================================

/**
 * Callback interface for UI events.
 * The UI layer calls these functions when user performs actions,
 * and the main application implements the actual logic.
 */
export interface UICallbacks {
  onContainerChange: (specName: string) => void;
  onAddItem: (item: Omit<CargoItem, 'id' | 'posX' | 'posY' | 'posZ' | 'visible' | 'color' | 'rotationY' | 'origLengthIn' | 'origWidthIn' | 'origHeightIn'>) => void;
  onAddItemFromLibrary: (def: LibraryItemDef) => void;
  onSelectItem: (id: string | null) => void;
  onDeleteItem: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleGrid: (show: boolean) => void;
  onToggleSnap: (snap: boolean) => void;
  onGridSizeChange: (size: number) => void;
  onColorModeChange: (mode: ColorMode) => void;
  onResetView: () => void;
  onExportImage: () => void;
  onShowManifest: () => void;
  onShowLoadPlan: () => void;
  onMoveItem: (id: string, axis: 'x' | 'y' | 'z', delta: number) => void;
  onToggleAllVisibility: (visible: boolean) => void;
  onClearAll: () => void;
  onRotateItem: (id: string, rotationType: 'y' | 'tipForward' | 'tipSide') => void;
  onToggleTheme: () => void;
  onToggleLabels: () => void;
  onEditItem: (id: string, changes: Partial<Pick<CargoItem, 'label' | 'lengthIn' | 'widthIn' | 'heightIn' | 'weightLbs' | 'category' | 'color' | 'acceptsOnTop' | 'canStackOn' | 'hazmatLevel'>>) => void;
  onSaveLoad: () => void;
  onLoadFile: () => void;
}

// ============================================================================
// MODULE STATE
// ============================================================================

/** Counter for cycling through item colors in custom mode */
let colorCounter = 0;

/** User's custom library items (saved in localStorage) */
let userLibrary: LibraryItemDef[] = [];

/** Combined library (default + user presets) */
let allLibraryItems: LibraryItemDef[] = [...DEFAULT_LIBRARY];

/** Global callbacks reference (used by helper functions) */
let _globalCallbacks: UICallbacks | null = null;

// ============================================================================
// COLOR MANAGEMENT
// ============================================================================

/**
 * Gets the next color from the palette for custom color mode.
 * Cycles through ITEM_COLORS array sequentially.
 * 
 * @returns Hex color code string
 */
export function getNextColor(): string {
  const c = ITEM_COLORS[colorCounter % ITEM_COLORS.length];
  colorCounter++;
  return c;
}

// ============================================================================
// LIBRARY MANAGEMENT
// ============================================================================

/**
 * Loads user's custom library presets from localStorage.
 * Called on app initialization.
 */
async function loadUserLibrary(): Promise<void> {
  try {
    const raw = await persistence.getItem('userLibrary');
    if (raw) {
      userLibrary = JSON.parse(raw);
      rebuildAllLibrary();
    }
  } catch (e) { /* ignore */ }
}

/**
 * Saves user's custom library presets to localStorage.
 */
async function saveUserLibrary(): Promise<void> {
  try {
    await persistence.setItem('userLibrary', JSON.stringify(userLibrary));
  } catch (e) { /* ignore */ }
}

/**
 * Rebuilds the complete library by merging default and user presets.
 */
function rebuildAllLibrary(): void {
  allLibraryItems = [...DEFAULT_LIBRARY, ...userLibrary];
}

// ============================================================================
// HAZMAT SELECT HELPER
// ============================================================================

/**
 * Builds the <select> HTML for choosing a UN/DOT hazmat class.
 * @param id - The element id to assign to the <select>
 * @param selected - The currently-selected HazmatLevel (default 'none')
 */
function buildHazmatSelectHTML(id: string, selected: HazmatLevel = 'none'): string {
  const options = (Object.keys(HAZMAT_CLASSES) as HazmatLevel[]).map(key => {
    const info = HAZMAT_CLASSES[key];
    const label = info.classNum === 0 ? 'None (no hazmat)' : info.label;
    return `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`;
  }).join('');
  return `<select id="${id}" style="width:100%">${options}</select>`;
}

// ============================================================================
// STACKING RULE UI HELPERS
// ============================================================================

const ALL_ITEM_CATEGORIES: ItemCategory[] = ['general', 'fragile', 'heavy', 'hazardous', 'perishable'];

/** Returns the select-mode string for a StackingRule value. */
function stackingModeOf(rule: StackingRule): 'all' | 'none' | 'custom' {
  if (rule === 'all') return 'all';
  if (rule === 'none') return 'none';
  return 'custom';
}

/**
 * Generates HTML for a stacking rule selector composed of a <select> and an
 * optional row of category checkboxes that appears when "custom" is chosen.
 * The two generated element IDs are `${idPrefix}-mode` and `${idPrefix}-cats`.
 */
function buildStackingRuleHTML(idPrefix: string, label: string, rule: StackingRule): string {
  const mode = stackingModeOf(rule);
  const customCats = Array.isArray(rule) ? (rule as ItemCategory[]) : [];
  return `
    <div class="form-group" style="flex:1">
      <label>${label}</label>
      <select id="${idPrefix}-mode" style="width:100%;margin-bottom:4px">
        <option value="all"    ${mode === 'all'    ? 'selected' : ''}>All categories</option>
        <option value="none"   ${mode === 'none'   ? 'selected' : ''}>None</option>
        <option value="custom" ${mode === 'custom' ? 'selected' : ''}>Custom…</option>
      </select>
      <div id="${idPrefix}-cats"
           style="display:${mode === 'custom' ? 'flex' : 'none'};flex-wrap:wrap;gap:4px;margin-top:2px">
        ${ALL_ITEM_CATEGORIES.map(cat => `
          <label style="display:flex;align-items:center;gap:3px;font-size:10px;cursor:pointer">
            <input type="checkbox" value="${cat}" ${customCats.includes(cat) ? 'checked' : ''}>
            <span class="category-badge ${cat}">${cat}</span>
          </label>`).join('')}
      </div>
    </div>`;
}

/** Wires the change event so the checkboxes div is shown only when "custom" is selected. */
function attachStackingRuleListener(idPrefix: string): void {
  const sel = document.getElementById(`${idPrefix}-mode`) as HTMLSelectElement | null;
  const cats = document.getElementById(`${idPrefix}-cats`) as HTMLDivElement | null;
  if (sel && cats) {
    sel.addEventListener('change', () => {
      cats.style.display = sel.value === 'custom' ? 'flex' : 'none';
    });
  }
}

/** Reads the current value from a stacking rule control back as a StackingRule. */
function readStackingRule(idPrefix: string): StackingRule {
  const sel = document.getElementById(`${idPrefix}-mode`) as HTMLSelectElement | null;
  if (!sel || sel.value === 'all') return 'all';
  if (sel.value === 'none') return 'none';
  const cats = document.getElementById(`${idPrefix}-cats`) as HTMLDivElement | null;
  if (!cats) return 'all';
  const checked = Array.from(cats.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'))
    .map(cb => cb.value as ItemCategory);
  return checked.length > 0 ? checked : 'none';
}

// ============================================================================
// UI BUILDING
// ============================================================================

/**
 * Builds the complete user interface programmatically.
 * Creates all panels, tabs, forms, buttons, and sets up event listeners.
 * 
 * **UI Structure:**
 * - Left Panel: Container selection, stats, add item form, library, settings
 * - Viewport: 3D canvas, toolbar, overlays, indicators
 * - Three tabs: Cargo, Library, Settings
 * 
 * @param callbacks - Object with callback functions for all user actions
 */
export function buildUI(callbacks: UICallbacks, user: AuthUser): void {
  _globalCallbacks = callbacks;

  loadUserLibrary().then(() => {
    renderLibraryItems('', callbacks);
  });

  // Pre-load the logo so it is ready for printable documents
  loadLogoDataUrl();

  const app = document.createElement('div');
  app.id = 'app-container';

  // LEFT PANEL
  const leftPanel = document.createElement('div');
  leftPanel.id = 'left-panel';

  // Header
  leftPanel.innerHTML = `
    <div class="panel-header">
      <div class="header-top">
        <div class="header-left">
          <div class="logo-icon" id="header-logo-wrap">A3</div>
          <div>
            <h1>Shipping Pro</h1>
            <div class="subtitle">3D Container Loading</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="user-badge">
            <span class="user-badge-name">${user.username}</span>
            <span class="user-badge-role ${user.role}">${user.role}</span>
          </div>
          <button class="theme-toggle-btn" id="theme-toggle" title="Switch to Dark Mode">🌙</button>
          <button class="theme-toggle-btn" id="btn-logout" title="Sign out" style="font-size:14px">⎋</button>
        </div>
      </div>
    </div>
  `;

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'panel-tabs';
  tabs.innerHTML = `
    <button class="panel-tab active" data-tab="cargo">Cargo</button>
    <button class="panel-tab" data-tab="library">Library</button>
    <button class="panel-tab" data-tab="settings">Settings</button>
  `;
  leftPanel.appendChild(tabs);

  // ===== TAB: CARGO =====
  const cargoTab = document.createElement('div');
  cargoTab.className = 'tab-content active';
  cargoTab.dataset.tab = 'cargo';

  const cargoScroll = document.createElement('div');
  cargoScroll.className = 'tab-scroll';
  cargoScroll.id = 'cargo-scroll';

  // Container selection
  const containerSection = document.createElement('div');
  containerSection.className = 'panel-section compact';
  containerSection.innerHTML = `
    <div class="panel-section-title">Container Type</div>
    <div class="container-selector" id="container-selector">
      ${Object.entries(CONTAINER_SPECS).map(([key, spec]) => `
        <button class="container-btn ${key === '20ft' ? 'active' : ''}" data-container="${key}">
          ${spec.label}
          <small>${spec.lengthFt.toFixed(0)}' x ${spec.widthFt.toFixed(0)}' x ${spec.heightFt.toFixed(0)}'</small>
        </button>
      `).join('')}
    </div>
  `;
  cargoScroll.appendChild(containerSection);

  // Stats section
  const statsSection = document.createElement('div');
  statsSection.className = 'panel-section compact';
  statsSection.id = 'stats-section';
  statsSection.innerHTML = `
    <div class="collapsible-header" data-collapse="stats">
      <div class="panel-section-title" style="margin-bottom:0">Container Stats</div>
      <span class="collapse-arrow">▼</span>
    </div>
    <div class="collapsible-body" id="stats-body" style="margin-top:10px">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Volume Used</div>
          <div class="stat-value accent-green" id="stat-volume">0.0%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Items</div>
          <div class="stat-value" id="stat-items">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Net Weight (Cargo)</div>
          <div class="stat-value accent-blue" id="stat-net-weight">0 lbs</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Gross Weight</div>
          <div class="stat-value" id="stat-gross-weight">0 lbs</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Available Weight</div>
          <div class="stat-value accent-green" id="stat-avail-weight">0 lbs</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Max Payload</div>
          <div class="stat-value accent-yellow" id="stat-max-weight">47,900 lbs</div>
        </div>
        <div class="stat-card full-width">
          <div class="stat-label">Weight Utilization</div>
          <div class="utilization-bar"><div class="utilization-fill" id="utilization-fill" style="width: 0%"></div></div>
        </div>
      </div>
    </div>
  `;
  cargoScroll.appendChild(statsSection);

  // Add item form
  const addSection = document.createElement('div');
  addSection.className = 'panel-section compact';
  addSection.innerHTML = `
    <div class="collapsible-header" data-collapse="add-item">
      <div class="panel-section-title" style="margin-bottom:0">Add Custom Item</div>
      <span class="collapse-arrow">▼</span>
    </div>
    <div class="collapsible-body" id="add-item-body" style="margin-top:10px">
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label>Label</label>
          <input type="text" id="item-label" placeholder="e.g. Pallet A1" />
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="item-category">
            <option value="general">General</option>
            <option value="fragile">Fragile</option>
            <option value="heavy">Heavy</option>
            <option value="hazardous">Hazardous</option>
            <option value="perishable">Perishable</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>L (in)</label>
          <input type="number" id="item-length" placeholder="48" min="1" />
        </div>
        <div class="form-group">
          <label>W (in)</label>
          <input type="number" id="item-width" placeholder="40" min="1" />
        </div>
        <div class="form-group">
          <label>H (in)</label>
          <input type="number" id="item-height" placeholder="48" min="1" />
        </div>
        <div class="form-group">
          <label>Wt (lbs)</label>
          <input type="number" id="item-weight" placeholder="500" min="0" />
        </div>
      </div>
      <div class="form-row" style="margin-top:6px">
        ${buildStackingRuleHTML('item-aot', 'Accepts on Top', 'all')}
        ${buildStackingRuleHTML('item-cso', 'Can Stack On', 'all')}
      </div>
      <div class="form-group" style="margin-top:6px">
        <label>Hazmat Class (UN/DOT)</label>
        ${buildHazmatSelectHTML('item-hazmat', 'none')}
      </div>
      <button class="btn btn-primary btn-full" id="btn-add-item" style="margin-top:6px">+ Add to Container</button>
    </div>
  `;
  cargoScroll.appendChild(addSection);

  cargoTab.appendChild(cargoScroll);

  // Items list header
  const itemsHeader = document.createElement('div');
  itemsHeader.className = 'items-list-header';
  itemsHeader.innerHTML = `
    <div class="panel-section-title" style="margin-bottom:0">Loaded Items</div>
    <div style="display:flex;gap:4px">
      <button class="btn btn-sm btn-secondary" id="btn-show-all" title="Show All">Show</button>
      <button class="btn btn-sm btn-secondary" id="btn-hide-all" title="Hide All">Hide</button>
      <button class="btn btn-sm btn-danger" id="btn-clear-all" title="Clear All">Clear</button>
    </div>
  `;
  cargoTab.appendChild(itemsHeader);

  // Items list
  const itemsList = document.createElement('div');
  itemsList.className = 'items-list-container';
  itemsList.id = 'items-list';
  itemsList.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📦</div>
      <h4>No items loaded</h4>
      <p>Add cargo items above or pick from<br>the Library tab, then drag them in 3D.</p>
    </div>
  `;
  cargoTab.appendChild(itemsList);

  leftPanel.appendChild(cargoTab);

  // ===== TAB: LIBRARY =====
  const libraryTab = document.createElement('div');
  libraryTab.className = 'tab-content';
  libraryTab.dataset.tab = 'library';

  const libraryContent = document.createElement('div');
  libraryContent.style.display = 'flex';
  libraryContent.style.flexDirection = 'column';
  libraryContent.style.height = '100%';
  libraryContent.style.overflow = 'hidden';

  const saveToLibSection = document.createElement('div');
  saveToLibSection.className = 'panel-section compact';
  saveToLibSection.innerHTML = `
    <div class="collapsible-header" data-collapse="save-preset">
      <div class="panel-section-title" style="margin-bottom:0">Save Custom Preset</div>
      <span class="collapse-arrow">▼</span>
    </div>
    <div class="collapsible-body collapsed" id="save-preset-body" style="margin-top:10px">
      <div class="library-custom-form">
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label>Name</label>
            <input type="text" id="lib-name" placeholder="My Custom Box" />
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="lib-category">
              <option value="general">General</option>
              <option value="fragile">Fragile</option>
              <option value="heavy">Heavy</option>
              <option value="hazardous">Hazardous</option>
              <option value="perishable">Perishable</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>L (in)</label>
            <input type="number" id="lib-length" placeholder="48" min="1" />
          </div>
          <div class="form-group">
            <label>W (in)</label>
            <input type="number" id="lib-width" placeholder="40" min="1" />
          </div>
          <div class="form-group">
            <label>H (in)</label>
            <input type="number" id="lib-height" placeholder="48" min="1" />
          </div>
          <div class="form-group">
            <label>Wt (lbs)</label>
            <input type="number" id="lib-weight" placeholder="500" min="0" />
          </div>
        </div>
        <button class="btn btn-success btn-full btn-sm" id="btn-save-preset">Save to Library</button>
      </div>
    </div>
  `;
  libraryContent.appendChild(saveToLibSection);

  const searchSection = document.createElement('div');
  searchSection.style.padding = '0 18px 10px';
  searchSection.style.flexShrink = '0';
  searchSection.innerHTML = `
    <div class="library-search-wrap">
      <input type="text" class="library-search" id="library-search" placeholder="Search items..." />
    </div>
  `;
  libraryContent.appendChild(searchSection);

  const libGrid = document.createElement('div');
  libGrid.className = 'library-grid';
  libGrid.id = 'library-grid';
  libGrid.style.padding = '0 18px 18px';
  libraryContent.appendChild(libGrid);

  libraryTab.appendChild(libraryContent);
  leftPanel.appendChild(libraryTab);

  // ===== TAB: SETTINGS =====
  const settingsTab = document.createElement('div');
  settingsTab.className = 'tab-content';
  settingsTab.dataset.tab = 'settings';

  const settingsScroll = document.createElement('div');
  settingsScroll.className = 'tab-scroll';

  const settingsSection1 = document.createElement('div');
  settingsSection1.className = 'panel-section';
  settingsSection1.innerHTML = `
    <div class="panel-section-title">Grid &amp; Snapping</div>
    <div class="options-row" style="margin-bottom:12px">
      <div class="toggle-container">
        <div class="toggle active" id="toggle-grid"></div>
        <span class="toggle-label">Show Floor Grid</span>
      </div>
    </div>
    <div class="options-row" style="margin-bottom:12px">
      <div class="toggle-container">
        <div class="toggle active" id="toggle-snap"></div>
        <span class="toggle-label">Snap to Grid</span>
      </div>
    </div>
    <div style="margin-top:4px">
      <label style="font-size:10.5px;color:var(--text-secondary);font-weight:500;display:block;margin-bottom:6px">Grid Size (inches)</label>
      <div class="grid-size-options" id="grid-size-options">
        ${GRID_SIZES.map(size => `
          <button class="grid-size-btn ${size === DEFAULT_GRID_SIZE ? 'active' : ''}" data-grid-size="${size}">${size}"</button>
        `).join('')}
      </div>
    </div>
  `;
  settingsScroll.appendChild(settingsSection1);

  const settingsSection1b = document.createElement('div');
  settingsSection1b.className = 'panel-section';
  settingsSection1b.innerHTML = `
    <div class="panel-section-title">Display</div>
    <div class="options-row" style="margin-bottom:12px">
      <div class="toggle-container">
        <div class="toggle active" id="toggle-labels"></div>
        <span class="toggle-label">Show 3D Item Labels</span>
      </div>
    </div>
    <div class="form-group" style="max-width:200px">
      <label>Color Mode</label>
      <select id="color-mode">
        <option value="custom">Custom Colors</option>
        <option value="category">By Category</option>
        <option value="weight">By Weight</option>
      </select>
    </div>
  `;
  settingsScroll.appendChild(settingsSection1b);

  const settingsSection2 = document.createElement('div');
  settingsSection2.className = 'panel-section';
  settingsSection2.innerHTML = `
    <div class="panel-section-title">Controls</div>
    <div style="font-size:11.5px;color:var(--text-secondary);line-height:2">
      <div><kbd style="background:var(--bg-card);padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border:1px solid var(--border-color)">Click</kbd> Select item</div>
      <div><kbd style="background:var(--bg-card);padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border:1px solid var(--border-color)">Drag</kbd> Move item (auto-stacks)</div>
      <div><kbd style="background:var(--bg-card);padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border:1px solid var(--border-color)">Shift+Drag</kbd> Force floor level</div>
      <div><kbd style="background:var(--bg-card);padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border:1px solid var(--border-color)">R</kbd> Rotate selected 90°</div>
      <div><kbd style="background:var(--bg-card);padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border:1px solid var(--border-color)">T</kbd> Tip selected forward</div>
      <div><kbd style="background:var(--bg-card);padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border:1px solid var(--border-color)">E</kbd> Edit selected item</div>
      <div><kbd style="background:var(--bg-card);padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border:1px solid var(--border-color)">L</kbd> Toggle 3D labels</div>
      <div><kbd style="background:var(--bg-card);padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border:1px solid var(--border-color)">Dbl-Click</kbd> Show item details</div>
      <div><kbd style="background:var(--bg-card);padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border:1px solid var(--border-color)">Right-Drag</kbd> Rotate camera</div>
      <div><kbd style="background:var(--bg-card);padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border:1px solid var(--border-color)">Scroll</kbd> Zoom in/out</div>
      <div><kbd style="background:var(--bg-card);padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border:1px solid var(--border-color)">Delete</kbd> Remove selected item</div>
    </div>
  `;
  settingsScroll.appendChild(settingsSection2);

  const settingsSection3 = document.createElement('div');
  settingsSection3.className = 'panel-section';
  settingsSection3.innerHTML = `
    <div class="panel-section-title">User Library</div>
    <p style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px">Manage your saved custom presets.</p>
    <button class="btn btn-sm btn-danger" id="btn-clear-library">Clear Custom Presets</button>
  `;
  settingsScroll.appendChild(settingsSection3);

  // ===== USER MANAGEMENT SECTION (admin-only) =====
  if (user.role === 'admin') {
    const userMgmtSection = document.createElement('div');
    userMgmtSection.className = 'panel-section';
    userMgmtSection.id = 'user-mgmt-section';
    userMgmtSection.innerHTML = `
      <div class="panel-section-title">User Management</div>

      <div id="user-list-area" style="margin-bottom:12px">
        <div style="font-size:11px;color:var(--text-muted)">Loading users…</div>
      </div>

      <div class="collapsible-header" data-collapse="add-user" style="margin-bottom:0;cursor:pointer">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Add New User</div>
        <span class="collapse-arrow">▼</span>
      </div>
      <div class="collapsible-body collapsed" id="add-user-body" style="margin-top:8px">
        <div class="form-group" style="margin-bottom:6px">
          <label>Username</label>
          <input type="text" id="new-user-username" placeholder="username" autocomplete="off" />
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label>Password</label>
          <input type="password" id="new-user-password" placeholder="password" autocomplete="new-password" />
        </div>
        <div class="form-group" style="margin-bottom:8px">
          <label>Role</label>
          <select id="new-user-role">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div id="new-user-error" style="display:none;font-size:11px;color:var(--accent-red);margin-bottom:6px"></div>
        <button class="btn btn-primary btn-full btn-sm" id="btn-create-user">+ Create User</button>
      </div>
    `;
    settingsScroll.appendChild(userMgmtSection);

    // Load + render users list
    const loadUserList = async () => {
      const area = document.getElementById('user-list-area');
      if (!area) return;
      try {
        const users = await apiListUsers();
        if (users.length === 0) {
          area.innerHTML = `<div style="font-size:11px;color:var(--text-muted)">No users found.</div>`;
          return;
        }
        area.innerHTML = `
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr style="border-bottom:1px solid var(--border-color)">
                <th style="text-align:left;padding:4px 6px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">User</th>
                <th style="text-align:left;padding:4px 6px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Role</th>
                <th style="padding:4px 6px"></th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr class="user-row" data-uid="${u.id}" style="border-bottom:1px solid var(--border-color)">
                  <td style="padding:5px 6px;color:${u.id === user.id ? 'var(--accent-blue)' : 'var(--text-bright)'};font-weight:${u.id === user.id ? '700' : '500'}">
                    ${u.username}${u.id === user.id ? ' <span style="font-size:9px;opacity:0.6">(you)</span>' : ''}
                  </td>
                  <td style="padding:5px 6px">
                    <select class="user-role-select" data-uid="${u.id}" style="font-size:10.5px;padding:2px 4px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm)" ${u.id === user.id ? 'disabled' : ''}>
                      <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>viewer</option>
                      <option value="editor" ${u.role === 'editor' ? 'selected' : ''}>editor</option>
                      <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                    </select>
                  </td>
                  <td style="padding:5px 6px;text-align:right">
                    ${u.id !== user.id ? `<button class="item-action-btn danger user-delete-btn" data-uid="${u.id}" title="Delete user" style="font-size:13px;line-height:1">×</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;

        // Wire role change selects
        area.querySelectorAll<HTMLSelectElement>('.user-role-select').forEach(sel => {
          sel.addEventListener('change', async () => {
            const uid = Number(sel.dataset.uid);
            const newRole = sel.value as 'admin' | 'editor' | 'viewer';
            const originalRole = sel.getAttribute('data-original') || sel.value;
            sel.setAttribute('data-original', newRole);
            try {
              await apiUpdateUserRole(uid, newRole);
              showToast(`Role updated to "${newRole}"`, 'success');
            } catch (err) {
              showToast((err as Error).message || 'Could not update role', 'error');
              sel.value = originalRole;
            }
          });
          sel.setAttribute('data-original', sel.value);
        });

        // Wire delete buttons
        area.querySelectorAll<HTMLButtonElement>('.user-delete-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const uid = Number(btn.dataset.uid);
            const row = btn.closest('.user-row') as HTMLElement;
            const username = row.querySelector('td')?.textContent?.trim().replace(' (you)', '') || 'this user';
            if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
            try {
              btn.disabled = true;
              await apiDeleteUser(uid);
              showToast(`User "${username}" deleted`, 'success');
              await loadUserList();
            } catch (err) {
              showToast((err as Error).message || 'Could not delete user', 'error');
              btn.disabled = false;
            }
          });
        });

      } catch (err) {
        if (area) area.innerHTML = `<div style="font-size:11px;color:var(--accent-red)">✕ ${(err as Error).message}</div>`;
      }
    };

    // Load immediately when Settings tab becomes active
    loadUserList();

    // Re-load when Settings tab is clicked (so list stays fresh)
    document.querySelectorAll('.panel-tab[data-tab="settings"]').forEach(tab => {
      tab.addEventListener('click', loadUserList);
    });

    // Wire "Create User" button
    document.getElementById('btn-create-user')?.addEventListener('click', async () => {
      const usernameEl = document.getElementById('new-user-username') as HTMLInputElement;
      const passwordEl = document.getElementById('new-user-password') as HTMLInputElement;
      const roleEl     = document.getElementById('new-user-role')     as HTMLSelectElement;
      const errorEl    = document.getElementById('new-user-error')    as HTMLDivElement;
      const submitBtn  = document.getElementById('btn-create-user')   as HTMLButtonElement;

      const username = usernameEl.value.trim();
      const password = passwordEl.value;
      const role = roleEl.value as 'admin' | 'editor' | 'viewer';

      errorEl.style.display = 'none';

      if (!username || !password) {
        errorEl.textContent = 'Username and password are required.';
        errorEl.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating…';

      try {
        await apiCreateUser(username, password, role);
        usernameEl.value = '';
        passwordEl.value = '';
        showToast(`User "${username}" created (${role})`, 'success');
        await loadUserList();
      } catch (err) {
        errorEl.textContent = (err as Error).message || 'Could not create user.';
        errorEl.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '+ Create User';
      }
    });
  }

  settingsTab.appendChild(settingsScroll);
  leftPanel.appendChild(settingsTab);

  app.appendChild(leftPanel);

  // ===== VIEWPORT =====
  const viewport = document.createElement('div');
  viewport.id = 'viewport-container';

  const canvas = document.createElement('canvas');
  canvas.id = 'three-canvas';
  viewport.appendChild(canvas);

  // Labels container (kept for API compatibility, but labels are now 3D objects)
  const labelsContainer = document.createElement('div');
  labelsContainer.id = 'labels-container';
  labelsContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:12;';
  viewport.appendChild(labelsContainer);

  // Toolbar
  const toolbarDiv = document.createElement('div');
  toolbarDiv.id = 'toolbar';
  toolbarDiv.innerHTML = `
    <button class="toolbar-btn" id="btn-reset-view" title="Reset Camera">Reset</button>
    <div class="toolbar-divider"></div>
    <button class="toolbar-btn" id="btn-view-front" title="Front View">Front</button>
    <button class="toolbar-btn" id="btn-view-top" title="Top View">Top</button>
    <button class="toolbar-btn" id="btn-view-side" title="Side View">Side</button>
    <button class="toolbar-btn" id="btn-view-iso" title="Isometric">3D</button>
    <div class="toolbar-divider"></div>
    <button class="toolbar-btn active" id="btn-toggle-labels" title="Toggle 3D Item Labels (L)">Labels</button>
    <button class="toolbar-btn" id="btn-rotate-sel" title="Rotate Selected 90° (R)">Rotate</button>
    <button class="toolbar-btn" id="btn-edit-sel" title="Edit Selected Item (E)">Edit</button>
    <div class="toolbar-divider"></div>
    <button class="toolbar-btn" id="btn-save-load" title="Save Load to File">💾 Save</button>
    <button class="toolbar-btn" id="btn-load-file" title="Load File">📂 Load</button>
    <div class="toolbar-divider"></div>
    <button class="toolbar-btn" id="btn-loadplan" title="Step-by-Step Load Plan">Load Plan</button>
    <button class="toolbar-btn" id="btn-manifest" title="Loading Manifest">Manifest</button>
    <button class="toolbar-btn" id="btn-export" title="Export Image">Export</button>
  `;
  viewport.appendChild(toolbarDiv);

  const infoOverlay = document.createElement('div');
  infoOverlay.id = 'info-overlay';
  viewport.appendChild(infoOverlay);

  const warningsContainer = document.createElement('div');
  warningsContainer.id = 'warnings-container';
  viewport.appendChild(warningsContainer);

  const snapIndicator = document.createElement('div');
  snapIndicator.className = 'snap-indicator';
  snapIndicator.id = 'snap-indicator';
  snapIndicator.innerHTML = `<span class="snap-dot"></span><span id="snap-label">Snap: ${DEFAULT_GRID_SIZE}" grid</span>`;
  viewport.appendChild(snapIndicator);

  const dropIndicator = document.createElement('div');
  dropIndicator.className = 'drop-indicator';
  dropIndicator.id = 'drop-indicator';
  viewport.appendChild(dropIndicator);

  app.appendChild(viewport);

  document.body.appendChild(app);

  // ===== INJECT LOGO INTO HEADER ONCE LOADED =====
  loadLogoDataUrl().then(dataUrl => {
    const logoWrap = document.getElementById('header-logo-wrap');
    if (logoWrap && dataUrl) {
      logoWrap.textContent = '';
      logoWrap.style.background = 'none';
      logoWrap.style.boxShadow = 'none';
      logoWrap.style.padding = '0';
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Company Logo';
      img.style.cssText = 'height:36px;width:auto;display:block;object-fit:contain;border-radius:0';
      logoWrap.appendChild(img);
    }
  });

  // ===== COLLAPSIBLE SECTIONS =====
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const collapseId = (header as HTMLElement).dataset.collapse!;
      const body = document.getElementById(`${collapseId}-body`);
      if (body) {
        const isCollapsed = body.classList.contains('collapsed');
        if (isCollapsed) {
          body.classList.remove('collapsed');
          header.classList.remove('collapsed');
        } else {
          body.classList.add('collapsed');
          header.classList.add('collapsed');
        }
      }
    });
  });

  // ===== EVENT LISTENERS =====

  document.getElementById('theme-toggle')!.addEventListener('click', () => {
    callbacks.onToggleTheme();
  });

  document.getElementById('btn-logout')!.addEventListener('click', () => {
    if (confirm('Sign out of A3 Shipping Pro?')) logout();
  });

  tabs.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = (tab as HTMLElement).dataset.tab!;
      leftPanel.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      leftPanel.querySelector(`.tab-content[data-tab="${tabName}"]`)?.classList.add('active');
    });
  });

  containerSection.querySelectorAll('.container-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      containerSection.querySelectorAll('.container-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      callbacks.onContainerChange((btn as HTMLElement).dataset.container!);
    });
  });

  document.getElementById('btn-add-item')!.addEventListener('click', () => {
    const label = (document.getElementById('item-label') as HTMLInputElement).value.trim();
    const category = (document.getElementById('item-category') as HTMLSelectElement).value as ItemCategory;
    const lengthIn = parseFloat((document.getElementById('item-length') as HTMLInputElement).value);
    const widthIn = parseFloat((document.getElementById('item-width') as HTMLInputElement).value);
    const heightIn = parseFloat((document.getElementById('item-height') as HTMLInputElement).value);
    const weightLbs = parseFloat((document.getElementById('item-weight') as HTMLInputElement).value);

    if (!label) { showToast('Please enter a label', 'error'); return; }
    if (!lengthIn || !widthIn || !heightIn) { showToast('Please enter valid dimensions', 'error'); return; }
    if (isNaN(weightLbs) || weightLbs < 0) { showToast('Please enter a valid weight', 'error'); return; }

    const acceptsOnTop = readStackingRule('item-aot');
    const canStackOn = readStackingRule('item-cso');
    const hazmatLevel = (document.getElementById('item-hazmat') as HTMLSelectElement).value as HazmatLevel;
    callbacks.onAddItem({ label, category, lengthIn, widthIn, heightIn, weightLbs, acceptsOnTop, canStackOn, hazmatLevel });

    (document.getElementById('item-label') as HTMLInputElement).value = '';
    (document.getElementById('item-length') as HTMLInputElement).value = '';
    (document.getElementById('item-width') as HTMLInputElement).value = '';
    (document.getElementById('item-height') as HTMLInputElement).value = '';
    (document.getElementById('item-weight') as HTMLInputElement).value = '';
  });

  document.getElementById('toggle-grid')!.addEventListener('click', (e) => {
    const el = e.currentTarget as HTMLElement;
    el.classList.toggle('active');
    callbacks.onToggleGrid(el.classList.contains('active'));
  });

  document.getElementById('toggle-snap')!.addEventListener('click', (e) => {
    const el = e.currentTarget as HTMLElement;
    el.classList.toggle('active');
    const active = el.classList.contains('active');
    callbacks.onToggleSnap(active);
    document.getElementById('snap-indicator')!.style.display = active ? 'flex' : 'none';
  });

  document.getElementById('toggle-labels')!.addEventListener('click', (e) => {
    const el = e.currentTarget as HTMLElement;
    el.classList.toggle('active');
    callbacks.onToggleLabels();
  });

  document.getElementById('btn-toggle-labels')!.addEventListener('click', () => {
    callbacks.onToggleLabels();
  });

  document.getElementById('grid-size-options')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.grid-size-btn') as HTMLElement;
    if (!btn) return;
    const size = parseInt(btn.dataset.gridSize!);
    document.querySelectorAll('.grid-size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    callbacks.onGridSizeChange(size);
    const snapLabel = document.getElementById('snap-label');
    if (snapLabel) snapLabel.textContent = `Snap: ${size}" grid`;
  });

  document.getElementById('color-mode')!.addEventListener('change', (e) => {
    callbacks.onColorModeChange((e.target as HTMLSelectElement).value as ColorMode);
  });

  document.getElementById('btn-reset-view')!.addEventListener('click', () => callbacks.onResetView());
  document.getElementById('btn-export')!.addEventListener('click', () => callbacks.onExportImage());
  document.getElementById('btn-manifest')!.addEventListener('click', () => callbacks.onShowManifest());
  document.getElementById('btn-loadplan')!.addEventListener('click', () => callbacks.onShowLoadPlan());
  
  // Save/Load buttons
  document.getElementById('btn-save-load')!.addEventListener('click', () => callbacks.onSaveLoad());
  document.getElementById('btn-load-file')!.addEventListener('click', () => callbacks.onLoadFile());

  document.getElementById('btn-rotate-sel')!.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('rotateSelected', { detail: { type: 'y' } }));
  });

  document.getElementById('btn-edit-sel')!.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('editSelected'));
  });

  document.getElementById('btn-show-all')!.addEventListener('click', () => callbacks.onToggleAllVisibility(true));
  document.getElementById('btn-hide-all')!.addEventListener('click', () => callbacks.onToggleAllVisibility(false));
  document.getElementById('btn-clear-all')!.addEventListener('click', () => {
    if (confirm('Remove all items from the container?')) {
      callbacks.onClearAll();
    }
  });

  document.getElementById('library-search')!.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value;
    renderLibraryItems(query, callbacks);
  });

  document.getElementById('btn-save-preset')!.addEventListener('click', async () => {
    const name = (document.getElementById('lib-name') as HTMLInputElement).value.trim();
    const category = (document.getElementById('lib-category') as HTMLSelectElement).value as ItemCategory;
    const lengthIn = parseFloat((document.getElementById('lib-length') as HTMLInputElement).value);
    const widthIn = parseFloat((document.getElementById('lib-width') as HTMLInputElement).value);
    const heightIn = parseFloat((document.getElementById('lib-height') as HTMLInputElement).value);
    const weightLbs = parseFloat((document.getElementById('lib-weight') as HTMLInputElement).value);

    if (!name) { showToast('Please enter a name', 'error'); return; }
    if (!lengthIn || !widthIn || !heightIn) { showToast('Please enter valid dimensions', 'error'); return; }
    if (isNaN(weightLbs) || weightLbs < 0) { showToast('Please enter a valid weight', 'error'); return; }

    const newItem: LibraryItemDef = {
      name,
      icon: '📦',
      lengthIn,
      widthIn,
      heightIn,
      weightLbs,
      category,
      group: 'My Presets',
    };

    userLibrary.push(newItem);
    rebuildAllLibrary();
    await saveUserLibrary();
    renderLibraryItems('', callbacks);

    (document.getElementById('lib-name') as HTMLInputElement).value = '';
    (document.getElementById('lib-length') as HTMLInputElement).value = '';
    (document.getElementById('lib-width') as HTMLInputElement).value = '';
    (document.getElementById('lib-height') as HTMLInputElement).value = '';
    (document.getElementById('lib-weight') as HTMLInputElement).value = '';

    showToast('Preset saved to library!', 'success');
  });

  document.getElementById('btn-clear-library')!.addEventListener('click', async () => {
    if (!confirm('Remove all custom presets?')) return;
    userLibrary = [];
    rebuildAllLibrary();
    await saveUserLibrary();
    renderLibraryItems('', callbacks);
    showToast('Custom presets cleared', 'success');
  });

  renderLibraryItems('', callbacks);

  // ===== ROLE-BASED UI RESTRICTIONS =====
  // Hide editor-only controls for viewer accounts (admins have full editor access)
  if (user.role === 'viewer') {
    // Hide the "Add Custom Item" section entirely
    if (addSection) (addSection as HTMLElement).style.display = 'none';

    // Hide editor toolbar buttons
    const editorToolbarBtns = ['btn-rotate-sel', 'btn-edit-sel', 'btn-save-load'];
    editorToolbarBtns.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Change "Load File" button label to "Load Project"
    const loadBtn = document.getElementById('btn-load-file');
    if (loadBtn) loadBtn.textContent = '📂 Projects';

    // Hide "Clear All" button from items header
    const clearBtn = document.getElementById('btn-clear-all');
    if (clearBtn) clearBtn.style.display = 'none';

    // Show view-only notice in empty state
    const itemsList = document.getElementById('items-list');
    if (itemsList && itemsList.querySelector('.empty-state')) {
      const notice = itemsList.querySelector('.empty-state p');
      if (notice) notice.textContent = 'Load a project to view the container.';
    }
  }
}

function renderLibraryItems(search: string, callbacks: UICallbacks): void {
  const grid = document.getElementById('library-grid');
  if (!grid) return;

  const query = search.toLowerCase().trim();
  const filtered = query
    ? allLibraryItems.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.group.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      )
    : allLibraryItems;

  const groups: Record<string, LibraryItemDef[]> = {};
  for (const item of filtered) {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="padding:30px 0">
        <div class="empty-state-icon">🔍</div>
        <h4>No items found</h4>
        <p>Try a different search term.</p>
      </div>
    `;
    return;
  }

  let html = '';
  for (const [groupName, items] of Object.entries(groups)) {
    html += `<div style="font-size:9.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin:10px 0 5px;padding-left:2px">${groupName}</div>`;
    for (const item of items) {
      const isUserItem = item.group === 'My Presets';
      html += `
        <div class="library-item" data-lib-name="${item.name}" data-lib-l="${item.lengthIn}" data-lib-w="${item.widthIn}" data-lib-h="${item.heightIn}" data-lib-wt="${item.weightLbs}" data-lib-cat="${item.category}" data-lib-icon="${item.icon}">
          <div class="library-item-icon">${item.icon}</div>
          <div class="library-item-info">
            <div class="library-item-name">${item.name}</div>
            <div class="library-item-dims">${item.lengthIn}"×${item.widthIn}"×${item.heightIn}" | ${item.weightLbs} lbs</div>
          </div>
          ${isUserItem ? `<button class="item-action-btn danger lib-delete-btn" title="Remove preset" data-lib-del="${item.name}">×</button>` : ''}
          <button class="library-item-add">+ Add</button>
        </div>
      `;
    }
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.library-item').forEach(el => {
    const addBtn = el.querySelector('.library-item-add');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const data = (el as HTMLElement).dataset;
        const def: LibraryItemDef = {
          name: data.libName!,
          icon: data.libIcon || '📦',
          lengthIn: parseFloat(data.libL!),
          widthIn: parseFloat(data.libW!),
          heightIn: parseFloat(data.libH!),
          weightLbs: parseFloat(data.libWt!),
          category: data.libCat as ItemCategory,
          group: '',
        };
        showLibraryNamingModal(def, callbacks);
      });
    }

    const delBtn = el.querySelector('.lib-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = (delBtn as HTMLElement).dataset.libDel!;
        userLibrary = userLibrary.filter(i => i.name !== name);
        rebuildAllLibrary();
        await saveUserLibrary();
        renderLibraryItems(search, callbacks);
        showToast('Preset removed', 'success');
      });
    }
  });
}

function showLibraryNamingModal(def: LibraryItemDef, callbacks: UICallbacks): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal small" style="position:relative">
      <h2>Add ${def.name}</h2>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px">
        ${def.lengthIn}" × ${def.widthIn}" × ${def.heightIn}" | ${def.weightLbs} lbs | <span class="category-badge ${def.category}">${def.category}</span>
      </p>
      <div class="form-group" style="margin-bottom:14px">
        <label>Item Name / Label</label>
        <input type="text" id="lib-add-name" placeholder="${def.name}" value="${def.name}" style="width:100%" />
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div class="form-group">
          <label>Quantity</label>
          <input type="number" id="lib-add-qty" value="1" min="1" max="50" style="width:100%" />
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary" id="lib-add-cancel">Cancel</button>
        <button class="btn btn-primary" id="lib-add-confirm">Add to Container</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const nameInput = document.getElementById('lib-add-name') as HTMLInputElement;
  nameInput.select();
  nameInput.focus();

  const doAdd = () => {
    const name = nameInput.value.trim() || def.name;
    const qty = Math.max(1, Math.min(50, parseInt((document.getElementById('lib-add-qty') as HTMLInputElement).value) || 1));

    for (let i = 0; i < qty; i++) {
      const label = qty > 1 ? `${name} #${i + 1}` : name;
      callbacks.onAddItem({
        label,
        lengthIn: def.lengthIn,
        widthIn: def.widthIn,
        heightIn: def.heightIn,
        weightLbs: def.weightLbs,
        category: def.category,
        acceptsOnTop: def.acceptsOnTop ?? 'all',
        canStackOn: def.canStackOn ?? 'all',
        hazmatLevel: def.hazmatLevel ?? 'none',
      });
    }

    overlay.remove();

    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.panel-tab[data-tab="cargo"]')?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelector('.tab-content[data-tab="cargo"]')?.classList.add('active');
  };

  document.getElementById('lib-add-cancel')!.addEventListener('click', () => overlay.remove());
  document.getElementById('lib-add-confirm')!.addEventListener('click', doAdd);

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAdd();
    if (e.key === 'Escape') overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ===== EDIT ITEM MODAL =====

export function showEditItemModal(item: CargoItem, callbacks: UICallbacks): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal small" style="position:relative">
      <h2>Edit Item</h2>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:6px">
        Modify the properties of <strong style="color:var(--text-bright)">"${item.label}"</strong>. Dimension changes update the item in-place.
      </p>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:8px 12px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-sm)">
        <span class="item-color" style="background:${item.color};width:12px;height:12px;border-radius:3px;display:inline-block;flex-shrink:0"></span>
        <span style="font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace">
          Current: ${item.lengthIn}" × ${item.widthIn}" × ${item.heightIn}" | ${item.weightLbs.toLocaleString()} lbs |
          <span class="category-badge ${item.category}">${item.category}</span>
        </span>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label>Label</label>
          <input type="text" id="edit-label" value="${escapeHtml(item.label)}" />
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="edit-category">
            <option value="general" ${item.category === 'general' ? 'selected' : ''}>General</option>
            <option value="fragile" ${item.category === 'fragile' ? 'selected' : ''}>Fragile</option>
            <option value="heavy" ${item.category === 'heavy' ? 'selected' : ''}>Heavy</option>
            <option value="hazardous" ${item.category === 'hazardous' ? 'selected' : ''}>Hazardous</option>
            <option value="perishable" ${item.category === 'perishable' ? 'selected' : ''}>Perishable</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>L (in)</label>
          <input type="number" id="edit-length" value="${item.lengthIn}" min="1" step="1" />
        </div>
        <div class="form-group">
          <label>W (in)</label>
          <input type="number" id="edit-width" value="${item.widthIn}" min="1" step="1" />
        </div>
        <div class="form-group">
          <label>H (in)</label>
          <input type="number" id="edit-height" value="${item.heightIn}" min="1" step="1" />
        </div>
        <div class="form-group">
          <label>Weight (lbs)</label>
          <input type="number" id="edit-weight" value="${item.weightLbs}" min="0" step="1" />
        </div>
      </div>
      <div class="form-row" style="margin-bottom:4px">
        <div class="form-group">
          <label>Color</label>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="color" id="edit-color" value="${item.color}" style="width:36px;height:30px;padding:0;border:1.5px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-input);cursor:pointer" />
            <span id="edit-color-hex" style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text-muted)">${item.color}</span>
          </div>
        </div>
      </div>

      <div class="form-row" style="margin-top:8px">
        ${buildStackingRuleHTML('edit-aot', 'Accepts on Top', item.acceptsOnTop ?? 'all')}
        ${buildStackingRuleHTML('edit-cso', 'Can Stack On', item.canStackOn ?? 'all')}
      </div>

      <div class="form-group" style="margin-top:8px">
        <label>Hazmat Class (UN/DOT)</label>
        ${buildHazmatSelectHTML('edit-hazmat', (item.hazmatLevel ?? 'none') as HazmatLevel)}
      </div>

      <div id="edit-validation-msg" style="margin-top:8px;min-height:24px"></div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button class="btn btn-secondary" id="edit-cancel">Cancel</button>
        <button class="btn btn-primary" id="edit-save">Save Changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  attachStackingRuleListener('edit-aot');
  attachStackingRuleListener('edit-cso');

  const labelInput = document.getElementById('edit-label') as HTMLInputElement;
  const catSelect = document.getElementById('edit-category') as HTMLSelectElement;
  const lengthInput = document.getElementById('edit-length') as HTMLInputElement;
  const widthInput = document.getElementById('edit-width') as HTMLInputElement;
  const heightInput = document.getElementById('edit-height') as HTMLInputElement;
  const weightInput = document.getElementById('edit-weight') as HTMLInputElement;
  const colorInput = document.getElementById('edit-color') as HTMLInputElement;
  const colorHexSpan = document.getElementById('edit-color-hex') as HTMLSpanElement;
  const validationMsg = document.getElementById('edit-validation-msg') as HTMLDivElement;

  weightInput.select();
  weightInput.focus();

  colorInput.addEventListener('input', () => {
    colorHexSpan.textContent = colorInput.value;
  });

  const validateLive = () => {
    const l = parseFloat(lengthInput.value);
    const w = parseFloat(widthInput.value);
    const h = parseFloat(heightInput.value);
    const wt = parseFloat(weightInput.value);
    const msgs: string[] = [];

    if (!l || l <= 0) msgs.push('Length must be > 0');
    if (!w || w <= 0) msgs.push('Width must be > 0');
    if (!h || h <= 0) msgs.push('Height must be > 0');
    if (isNaN(wt) || wt < 0) msgs.push('Weight must be ≥ 0');

    if (msgs.length > 0) {
      validationMsg.innerHTML = `<span style="font-size:11px;color:var(--accent-red)">${msgs.join(' · ')}</span>`;
      return false;
    }

    validationMsg.innerHTML = `<span style="font-size:11px;color:var(--accent-green)">✓ Looks good</span>`;
    return true;
  };

  [lengthInput, widthInput, heightInput, weightInput].forEach(inp => {
    inp.addEventListener('input', validateLive);
  });

  validateLive();

  const doSave = () => {
    const label = labelInput.value.trim();
    const category = catSelect.value as ItemCategory;
    const lengthIn = parseFloat(lengthInput.value);
    const widthIn = parseFloat(widthInput.value);
    const heightIn = parseFloat(heightInput.value);
    const weightLbs = parseFloat(weightInput.value);
    const color = colorInput.value;

    if (!label) { showToast('Please enter a label', 'error'); return; }
    if (!lengthIn || lengthIn <= 0 || !widthIn || widthIn <= 0 || !heightIn || heightIn <= 0) {
      showToast('Please enter valid dimensions (> 0)', 'error');
      return;
    }
    if (isNaN(weightLbs) || weightLbs < 0) {
      showToast('Please enter a valid weight (≥ 0)', 'error');
      return;
    }

    const changes: Partial<Pick<CargoItem, 'label' | 'lengthIn' | 'widthIn' | 'heightIn' | 'weightLbs' | 'category' | 'color' | 'acceptsOnTop' | 'canStackOn' | 'hazmatLevel'>> = {};
    
    if (label !== item.label) changes.label = label;
    if (category !== item.category) changes.category = category;
    if (lengthIn !== item.lengthIn) changes.lengthIn = lengthIn;
    if (widthIn !== item.widthIn) changes.widthIn = widthIn;
    if (heightIn !== item.heightIn) changes.heightIn = heightIn;
    if (weightLbs !== item.weightLbs) changes.weightLbs = weightLbs;
    if (color !== item.color) changes.color = color;

    const newAot = readStackingRule('edit-aot');
    const newCso = readStackingRule('edit-cso');
    if (JSON.stringify(newAot) !== JSON.stringify(item.acceptsOnTop ?? 'all')) changes.acceptsOnTop = newAot;
    if (JSON.stringify(newCso) !== JSON.stringify(item.canStackOn ?? 'all')) changes.canStackOn = newCso;

    const newHazmat = (document.getElementById('edit-hazmat') as HTMLSelectElement).value as HazmatLevel;
    if (newHazmat !== (item.hazmatLevel ?? 'none')) changes.hazmatLevel = newHazmat;

    if (Object.keys(changes).length === 0) {
      overlay.remove();
      return;
    }

    callbacks.onEditItem(item.id, changes);
    overlay.remove();
  };

  document.getElementById('edit-cancel')!.addEventListener('click', () => overlay.remove());
  document.getElementById('edit-save')!.addEventListener('click', doSave);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      doSave();
    }
  };
  overlay.addEventListener('keydown', onKeyDown);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function updateItemsList(
  items: CargoItem[],
  selectedId: string | null,
  callbacks: {
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onToggleVis: (id: string) => void;
    onEdit: (id: string) => void;
  }
): void {
  const list = document.getElementById('items-list')!;
  
  if (items.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <h4>No items loaded</h4>
        <p>Add cargo items above or pick from<br>the Library tab, then drag them in 3D.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map(item => {
    const rotLabel = getRotationLabel(item);
    return `
    <div class="item-card ${item.id === selectedId ? 'selected' : ''}" data-item-id="${item.id}">
      <div class="item-header">
        <span class="item-name">
          <span class="item-color" style="background:${item.color};opacity:${item.visible ? 1 : 0.3}"></span>
          <span class="item-name-text" style="opacity:${item.visible ? 1 : 0.5}">${item.label}</span>
          <span class="category-badge ${item.category}">${item.category}</span>
          ${item.hazmatLevel && item.hazmatLevel !== 'none' ? (() => { const hi = HAZMAT_CLASSES[item.hazmatLevel!]; return `<span style="display:inline-flex;align-items:center;gap:2px;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${hi.color};color:${hi.textColor};border:1px solid rgba(0,0,0,0.15)">⚠ ${hi.shortLabel}</span>`; })() : ''}
          ${rotLabel ? `<span class="rotation-badge">${rotLabel}</span>` : ''}
        </span>
        <div class="item-actions">
          <button class="item-action-btn" data-action="edit" data-item-id="${item.id}" title="Edit item (E)">✎</button>
          <button class="item-action-btn" data-action="visibility" data-item-id="${item.id}" title="${item.visible ? 'Hide' : 'Show'}">${item.visible ? '●' : '○'}</button>
          <button class="item-action-btn danger" data-action="delete" data-item-id="${item.id}" title="Delete">×</button>
        </div>
      </div>
      <div class="item-details">
        <span>${formatDimensions(item.lengthIn, item.widthIn, item.heightIn)}</span>
        <span>${item.weightLbs.toLocaleString()} lbs</span>
        <span>Y: ${item.posY.toFixed(0)}"</span>
      </div>
    </div>
  `;}).join('');

  list.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const actionBtn = target.closest('[data-action]') as HTMLElement;
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        const itemId = actionBtn.dataset.itemId!;
        if (action === 'delete') callbacks.onDelete(itemId);
        else if (action === 'visibility') callbacks.onToggleVis(itemId);
        else if (action === 'edit') callbacks.onEdit(itemId);
        return;
      }
      callbacks.onSelect((card as HTMLElement).dataset.itemId!);
    });

    card.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-action]')) return;
      callbacks.onEdit((card as HTMLElement).dataset.itemId!);
    });
  });
}

export function updateStats(items: CargoItem[], container: ContainerSpec): void {
  const utilization = calculateUtilization(items, container);
  const netWeight = calculateTotalWeight(items);        // cargo only
  const grossWeight = netWeight + container.tareWeightLbs; // tare + cargo
  const availWeight = container.maxWeightLbs - netWeight;  // remaining payload
  const weightPct = (netWeight / container.maxWeightLbs) * 100;

  const volEl      = document.getElementById('stat-volume');
  const itemsEl    = document.getElementById('stat-items');
  const netWtEl    = document.getElementById('stat-net-weight');
  const grossWtEl  = document.getElementById('stat-gross-weight');
  const availWtEl  = document.getElementById('stat-avail-weight');
  const maxWtEl    = document.getElementById('stat-max-weight');
  const fillEl     = document.getElementById('utilization-fill');

  if (volEl)     volEl.textContent = utilization.toFixed(1) + '%';
  if (itemsEl)   itemsEl.textContent = items.length.toString();
  if (maxWtEl)   maxWtEl.textContent = container.maxWeightLbs.toLocaleString() + ' lbs';

  if (netWtEl) {
    netWtEl.textContent = netWeight.toLocaleString() + ' lbs';
    netWtEl.className = netWeight > container.maxWeightLbs
      ? 'stat-value accent-red'
      : 'stat-value accent-blue';
  }

  if (grossWtEl) {
    grossWtEl.textContent = grossWeight.toLocaleString() + ' lbs';
    grossWtEl.className = 'stat-value';
  }

  if (availWtEl) {
    availWtEl.textContent = availWeight.toLocaleString() + ' lbs';
    availWtEl.className = availWeight < 0
      ? 'stat-value accent-red'
      : 'stat-value accent-green';
  }

  if (fillEl) {
    fillEl.style.width = Math.min(weightPct, 100) + '%';
    fillEl.className = 'utilization-fill';
    if (weightPct > 90) fillEl.classList.add('danger');
    else if (weightPct > 70) fillEl.classList.add('warning');
  }
}

export function showItemInfo(item: CargoItem | null, gridSize: number): void {
  const overlay = document.getElementById('info-overlay')!;
  if (!item) {
    overlay.classList.remove('visible');
    overlay.innerHTML = '';
    return;
  }

  const rotLabel = getRotationLabel(item);

  overlay.classList.add('visible');
  overlay.innerHTML = `
    <div class="info-card" style="position:relative">
      <button class="close-btn" id="info-close">×</button>
      <h3>
        <span class="item-color" style="background:${item.color};width:12px;height:12px;border-radius:3px;display:inline-block"></span>
        ${item.label}
      </h3>
      <div class="info-row"><span class="info-label">Category</span><span class="info-value"><span class="category-badge ${item.category}">${item.category}</span></span></div>
      <div class="info-row"><span class="info-label">Dimensions</span><span class="info-value">${formatDimensions(item.lengthIn, item.widthIn, item.heightIn)}</span></div>
      <div class="info-row"><span class="info-label">Original</span><span class="info-value">${formatDimensions(item.origLengthIn, item.origWidthIn, item.origHeightIn)}</span></div>
      <div class="info-row"><span class="info-label">Volume</span><span class="info-value">${((item.lengthIn * item.widthIn * item.heightIn) / 1728).toFixed(1)} ft³</span></div>
      <div class="info-row"><span class="info-label">Weight</span><span class="info-value">${item.weightLbs.toLocaleString()} lbs</span></div>
      <div class="info-row"><span class="info-label">Position X</span><span class="info-value">${item.posX.toFixed(0)}"</span></div>
      <div class="info-row"><span class="info-label">Position Y</span><span class="info-value">${item.posY.toFixed(0)}"</span></div>
      <div class="info-row"><span class="info-label">Position Z</span><span class="info-value">${item.posZ.toFixed(0)}"</span></div>
      <div class="info-row"><span class="info-label">Rotation</span><span class="info-value">${rotLabel || '0°'} ${item.rotationY > 0 ? `<span class="rotation-badge">${rotLabel}</span>` : ''}</span></div>
      ${item.hazmatLevel && item.hazmatLevel !== 'none' ? (() => { const hi = HAZMAT_CLASSES[item.hazmatLevel!]; return `<div class="info-row"><span class="info-label">Hazmat</span><span class="info-value"><span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:${hi.color};color:${hi.textColor};border:1px solid rgba(0,0,0,0.15)">⚠ ${hi.label}</span></span></div>`; })() : ''}
      
      <div style="margin-top:10px">
        <button class="btn btn-sm btn-primary btn-full" id="info-edit-btn" style="margin-bottom:8px">Edit Properties</button>
      </div>

      <div style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn btn-sm btn-secondary" data-move="x-" title="Move toward front">← X</button>
        <button class="btn btn-sm btn-secondary" data-move="x+" title="Move toward back">X →</button>
        <button class="btn btn-sm btn-secondary" data-move="z-" title="Move left">← Z</button>
        <button class="btn btn-sm btn-secondary" data-move="z+" title="Move right">Z →</button>
        <button class="btn btn-sm btn-secondary" data-move="y+" title="Move up">↑ Y</button>
        <button class="btn btn-sm btn-secondary" data-move="y-" title="Move down">↓ Y</button>
      </div>
      <div class="rotate-buttons">
        <button class="rotate-btn" data-rotate="y" title="Rotate 90° horizontally">Rotate 90°</button>
        <button class="rotate-btn" data-rotate="tipForward" title="Tip forward (L/H swap)">Tip Forward</button>
        <button class="rotate-btn" data-rotate="tipSide" title="Tip sideways (W/H swap)">Tip Sideways</button>
      </div>
    </div>
  `;

  document.getElementById('info-close')!.addEventListener('click', () => {
    overlay.classList.remove('visible');
    overlay.innerHTML = '';
  });

  document.getElementById('info-edit-btn')!.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('editItem', { detail: { id: item.id } }));
  });

  overlay.querySelectorAll('[data-move]').forEach(btn => {
    btn.addEventListener('click', () => {
      const move = (btn as HTMLElement).dataset.move!;
      const axis = move[0] as 'x' | 'y' | 'z';
      const dir = move[1] === '+' ? 1 : -1;
      const event = new CustomEvent('moveItem', { detail: { id: item.id, axis, delta: dir * gridSize } });
      window.dispatchEvent(event);
    });
  });

  overlay.querySelectorAll('[data-rotate]').forEach(btn => {
    btn.addEventListener('click', () => {
      const rotationType = (btn as HTMLElement).dataset.rotate!;
      const event = new CustomEvent('rotateItem', { detail: { id: item.id, rotationType } });
      window.dispatchEvent(event);
    });
  });
}

export function updateDropIndicator(text: string | null, stacking: boolean = false): void {
  const el = document.getElementById('drop-indicator');
  if (!el) return;
  if (!text) {
    el.classList.remove('visible');
    el.classList.remove('stacking');
    return;
  }
  el.textContent = text;
  el.classList.add('visible');
  if (stacking) {
    el.classList.add('stacking');
  } else {
    el.classList.remove('stacking');
  }
}

export function showManifestModal(
  items: CargoItem[],
  container: ContainerSpec,
  snapshots: { label: string; dataUrl: string }[],
  onClose: () => void
): void {
  const utilization = calculateUtilization(items, container);
  const totalWeight = calculateTotalWeight(items);
  const dist = getWeightDistribution(items, container);
  const totalVolume = items.reduce((s, i) => s + (i.lengthIn * i.widthIn * i.heightIn) / 1728, 0);
  const containerVolume = (container.lengthIn * container.widthIn * container.heightIn) / 1728;

  const snapshotSectionHtml = snapshots.length > 0 ? `
    <h3>3D View Snapshots</h3>
    <div style="display:grid;grid-template-columns:${snapshots.length === 1 ? '1fr' : '1fr 1fr'};gap:12px;margin-bottom:18px">
      ${snapshots.map(s => `
        <div style="border:1px solid var(--border-color);border-radius:var(--radius-md);overflow:hidden">
          <img src="${s.dataUrl}"
               style="width:100%;height:auto;display:block"
               alt="${s.label}" />
          <div style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;background:var(--bg-card);text-align:center">
            ${s.label}
          </div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const warnFB = Math.abs(dist.front - dist.back) > 20;
  const warnLR = Math.abs(dist.left - dist.right) > 20;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="position:relative" id="manifest-modal-content">
      <h2>Loading Manifest — A3 Shipping Pro</h2>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:18px">
        Container: <strong style="color:var(--text-bright)">${container.label}</strong> |
        Internal: ${container.lengthIn}" × ${container.widthIn}" × ${container.heightIn}" |
        Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
      </div>

      <div class="manifest-summary">
        <div class="manifest-stat">
          <div class="value">${utilization.toFixed(1)}%</div>
          <div class="label">Volume Utilization</div>
        </div>
        <div class="manifest-stat">
          <div class="value">${totalWeight.toLocaleString()}</div>
          <div class="label">Total Weight (lbs)</div>
        </div>
        <div class="manifest-stat">
          <div class="value">${items.length}</div>
          <div class="label">Total Items</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div class="stat-card">
          <div class="stat-label">Volume Used</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-bright)">${totalVolume.toFixed(1)} ft³ / ${containerVolume.toFixed(1)} ft³</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Max Payload (Default)</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-bright)">${container.maxWeightLbs.toLocaleString()} lbs</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px">
        <div class="stat-card">
          <div class="stat-label">Net Weight (Cargo)</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:${totalWeight > container.maxWeightLbs ? 'var(--accent-red)' : 'var(--accent-blue)'}">
            ${totalWeight.toLocaleString()} lbs
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Gross Weight</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-bright)">
            ${(totalWeight + container.tareWeightLbs).toLocaleString()} lbs
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Available Weight</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:${(container.maxWeightLbs - totalWeight) < 0 ? 'var(--accent-red)' : 'var(--accent-green)'}">
            ${(container.maxWeightLbs - totalWeight).toLocaleString()} lbs
          </div>
        </div>
      </div>

      <div class="stat-card" style="margin-bottom:18px">
        <div class="stat-label">Weight Distribution (Front/Back: ${dist.front.toFixed(0)}% / ${dist.back.toFixed(0)}% &nbsp;|&nbsp; Left/Right: ${dist.left.toFixed(0)}% / ${dist.right.toFixed(0)}%)</div>
        <div class="weight-dist">
          <div class="weight-dist-segment" style="flex:${dist.front};background:var(--accent-cyan)" title="Front: ${dist.front.toFixed(1)}%"></div>
          <div class="weight-dist-segment" style="flex:${dist.back};background:var(--accent-blue)" title="Back: ${dist.back.toFixed(1)}%"></div>
        </div>
        <div style="margin-top:5px;font-size:10.5px;color:var(--text-muted)">
          ${warnFB ? '⚠ Uneven front/back weight distribution' : '✓ Balanced front/back'}
          &nbsp;|&nbsp;
          ${warnLR ? '⚠ Uneven left/right weight distribution' : '✓ Balanced left/right'}
        </div>
      </div>

      ${snapshotSectionHtml}

      <h3>Item Details</h3>
      <div style="overflow-x:auto">
        <table class="manifest-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Label</th>
              <th>Category</th>
              <th>Dimensions (L×W×H)</th>
              <th>Weight</th>
              <th>Position (X, Y, Z)</th>
              <th>Rotation</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, i) => `
              <tr>
                <td>${i + 1}</td>
                <td style="color:var(--text-bright);font-family:'Inter',sans-serif;font-weight:600">${item.label}</td>
                <td><span class="category-badge ${item.category}">${item.category}</span></td>
                <td>${item.lengthIn}" × ${item.widthIn}" × ${item.heightIn}"</td>
                <td>${item.weightLbs.toLocaleString()} lbs</td>
                <td>${item.posX.toFixed(0)}", ${item.posY.toFixed(0)}", ${item.posZ.toFixed(0)}"</td>
                <td>${getRotationLabel(item) || '0°'}</td>
                <td>${((item.lengthIn * item.widthIn * item.heightIn) / 1728).toFixed(1)} ft³</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="pdf-export-section">
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn btn-secondary" id="manifest-close">Close</button>
          <button class="btn btn-secondary" id="manifest-copy">Copy Text</button>
          <button class="btn btn-primary" id="manifest-print">Print / PDF</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      onClose();
    }
  });

  document.getElementById('manifest-close')!.addEventListener('click', () => {
    overlay.remove();
    onClose();
  });

  document.getElementById('manifest-copy')!.addEventListener('click', () => {
    const text = generateManifestText(items, container, utilization, totalWeight, dist);
    navigator.clipboard.writeText(text).then(() => {
      showToast('Manifest copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Could not copy to clipboard', 'error');
    });
  });

  document.getElementById('manifest-print')!.addEventListener('click', () => {
    printManifest(items, container, utilization, totalWeight, dist, snapshots);
  });
}

function printManifest(
  items: CargoItem[],
  container: ContainerSpec,
  utilization: number,
  totalWeight: number,
  dist: { front: number; back: number; left: number; right: number },
  snapshots: { label: string; dataUrl: string }[],
): void {
  const totalVolume = items.reduce((s, i) => s + (i.lengthIn * i.widthIn * i.heightIn) / 1728, 0);
  const containerVolume = (container.lengthIn * container.widthIn * container.heightIn) / 1728;

  const snapshotHtmlBlocks = snapshots.length > 0
    ? snapshots.map(s => `
        <div class="snapshot">
          <div class="snap-label">${s.label}</div>
          <img src="${s.dataUrl}" alt="${s.label}" />
        </div>
      `).join('')
    : '';

  const logoDataUrl = getLogoDataUrl();
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="Logo" style="height:40px;width:auto;display:block;object-fit:contain;margin-bottom:4px" />`
    : '';

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>A3 Shipping Pro \u2014 Loading Manifest</title>
<style>
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap");
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;color:#1a202c;padding:32px;font-size:12px;line-height:1.5;background:white}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid #1e40af;padding-bottom:16px}
.header-brand{display:flex;align-items:center;gap:10px}
.header h1{font-size:22px;font-weight:800;color:#1e3a5f}.header .subtitle{font-size:11px;color:#4b6280;margin-top:2px}.header .date{font-size:11px;color:#666;text-align:right}
table{width:100%;border-collapse:collapse;font-size:10px}th{text-align:left;padding:8px 10px;background:#f0f4fa;color:#1e3a5f;font-size:8.5px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #c7d8f0}
td{padding:7px 10px;border-bottom:1px solid #eef2f7;font-family:'JetBrains Mono',monospace;font-size:10px}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #c7d8f0;font-size:10px;color:#7a90aa;text-align:center}
.snapshot{margin-bottom:18px;border:1px solid #c7d8f0;border-radius:6px;overflow:hidden;page-break-inside:avoid}
.snapshot img{width:1200px;max-width:100%;height:auto;display:block}
.snap-label{padding:5px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#4b6280;background:#f0f4fa;border-bottom:1px solid #c7d8f0}
.snapshots-section{margin-bottom:18px}
.snapshots-heading{font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:10px}
</style></head><body>
<div class="header"><div class="header-brand">${logoHtml}<div><h1>Shipping Pro</h1><div class="subtitle">Container Loading Manifest</div></div></div>
<div class="date">Container: <strong>${container.label}</strong><br>${container.lengthIn}" &times; ${container.widthIn}" &times; ${container.heightIn}"<br>${new Date().toLocaleString()}</div></div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;border:1px solid #c7d8f0;border-radius:6px;padding:12px;background:#f8fafd">
  <div style="text-align:center"><div style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:#1e40af">${totalWeight.toLocaleString()}</div><div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#4b6280;letter-spacing:0.6px">Net Weight (lbs)</div></div>
  <div style="text-align:center"><div style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:#1e3a5f">${(totalWeight + container.tareWeightLbs).toLocaleString()}</div><div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#4b6280;letter-spacing:0.6px">Gross Weight (lbs)</div></div>
  <div style="text-align:center"><div style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:${(container.maxWeightLbs - totalWeight) < 0 ? '#dc2626' : '#059669'}">${(container.maxWeightLbs - totalWeight).toLocaleString()}</div><div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#4b6280;letter-spacing:0.6px">Available (lbs)</div></div>
  <div style="text-align:center"><div style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:#78350f">${container.maxWeightLbs.toLocaleString()}</div><div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#4b6280;letter-spacing:0.6px">Max Payload (lbs)</div></div>
</div>
<br>
${snapshotHtmlBlocks ? `<div class="snapshots-section"><div class="snapshots-heading">3D View Snapshots</div>${snapshotHtmlBlocks}</div>` : ''}
<table><thead><tr><th>#</th><th>Label</th><th>Category</th><th>Dimensions</th><th>Weight</th><th>Position</th><th>Volume</th></tr></thead><tbody>
${items.map((item, i) => `<tr><td>${i+1}</td><td style="font-family:'Inter',sans-serif;font-weight:600">${item.label}</td><td>${item.category}</td><td>${item.lengthIn}" &times; ${item.widthIn}" &times; ${item.heightIn}"</td><td>${item.weightLbs.toLocaleString()} lbs</td><td>${item.posX.toFixed(0)}", ${item.posY.toFixed(0)}", ${item.posZ.toFixed(0)}"</td><td>${((item.lengthIn*item.widthIn*item.heightIn)/1728).toFixed(1)} ft&#179;</td></tr>`).join('')}
</tbody></table>
<div class="footer">A3 Shipping Pro &mdash; ${new Date().toLocaleString()}</div></body></html>`;

  try {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    if (printWindow) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      showToast('Print window opened', 'success');
    } else {
      downloadFile(html, 'text/html', `a3-manifest-${formatDateForFilename()}.html`);
    }
  } catch (e) {
    downloadFile(html, 'text/html', `a3-manifest-${formatDateForFilename()}.html`);
  }
}

function downloadFile(content: string, type: string, filename: string): void {
  try {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast('File downloaded', 'success');
  } catch (e) {
    showToast('Could not generate file', 'error');
  }
}

/** Returns a readable date string suitable for use in filenames, e.g. "2026-06-04". */
export function formatDateForFilename(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateManifestText(
  items: CargoItem[],
  container: ContainerSpec,
  utilization: number,
  totalWeight: number,
  dist: { front: number; back: number; left: number; right: number }
): string {
  let text = `A3 SHIPPING PRO - CONTAINER LOADING MANIFEST\n`;
  text += `${'='.repeat(60)}\n`;
  text += `Container: ${container.label}\n`;
  text += `Internal: ${container.lengthIn}" x ${container.widthIn}" x ${container.heightIn}"\n`;
  text += `Date: ${new Date().toLocaleString()}\n\n`;
  text += `SUMMARY\n${'-'.repeat(40)}\n`;
  text += `Volume Utilization: ${utilization.toFixed(1)}%\n`;
  text += `Net Weight (Cargo):  ${totalWeight.toLocaleString()} lbs\n`;
  text += `Gross Weight:        ${(totalWeight + container.tareWeightLbs).toLocaleString()} lbs\n`;
  text += `Available Weight:    ${(container.maxWeightLbs - totalWeight).toLocaleString()} lbs\n`;
  text += `Max Payload (Default): ${container.maxWeightLbs.toLocaleString()} lbs\n`;
  text += `Total Items: ${items.length}\n\n`;
  text += `ITEMS\n${'-'.repeat(40)}\n`;
  items.forEach((item, i) => {
    text += `${i + 1}. ${item.label} [${item.category}]\n`;
    text += `   ${item.lengthIn}" x ${item.widthIn}" x ${item.heightIn}" | ${item.weightLbs.toLocaleString()} lbs\n`;
    text += `   Pos: X=${item.posX.toFixed(0)}", Y=${item.posY.toFixed(0)}", Z=${item.posZ.toFixed(0)}"\n\n`;
  });
  return text;
}

export function showToast(message: string, type: 'warning' | 'error' | 'success' = 'warning'): void {
  const container = document.getElementById('warnings-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `warning-toast ${type === 'error' ? 'error' : ''}`;
  if (type === 'success') {
    toast.style.borderColor = 'rgba(52,211,153,0.3)';
    toast.style.borderLeftColor = 'var(--accent-green)';
  }
  // Use subtle Unicode prefix symbols instead of verbose text labels
  const prefix = type === 'error' ? '✕ ' : type === 'success' ? '✓ ' : '⚠ ';
  toast.textContent = prefix + message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

export function showValidationWarnings(result: ValidationResult): void {
  for (const err of result.errors) {
    showToast(err, 'error');
  }
  for (const warn of result.warnings) {
    showToast(warn, 'warning');
  }
}

export function updateThemeIcon(isDark: boolean): void {
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

export function updateLabelsToggleUI(active: boolean): void {
  const toolbarBtn = document.getElementById('btn-toggle-labels');
  if (toolbarBtn) {
    if (active) {
      toolbarBtn.classList.add('active');
    } else {
      toolbarBtn.classList.remove('active');
    }
  }

  const settingsToggle = document.getElementById('toggle-labels');
  if (settingsToggle) {
    if (active) {
      settingsToggle.classList.add('active');
    } else {
      settingsToggle.classList.remove('active');
    }
  }
}

// ============================================================================
// CLOUD PROJECTS MODAL
// ============================================================================

export interface ProjectsModalOptions {
  mode: 'save' | 'load';
  user: AuthUser;
  /** Present when mode === 'save'. The current container state to persist. */
  saveData?: SavedLoad;
  /** Called when mode === 'load' and the user selects a project. */
  onLoad?: (savedLoad: SavedLoad) => void;
}

/**
 * Opens the cloud Projects modal.
 *
 * Save mode: lets editors give the project a name and save (create or overwrite).
 * Load mode: lists all projects with a Load button; editors also see a Delete button.
 */
export function showProjectsModal(options: ProjectsModalOptions): void {
  const { mode, user, saveData, onLoad } = options;
  const isEditor = user.role === 'editor' || user.role === 'admin';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const titleText = mode === 'save' ? '💾 Save Project' : '📂 Open Project';

  overlay.innerHTML = `
    <div class="modal small" style="position:relative;min-width:420px">
      <h2>${titleText}</h2>

      ${mode === 'save' ? `
        <div class="form-group" style="margin-bottom:12px">
          <label>Project Name</label>
          <input type="text" id="proj-name-input" placeholder="e.g. Container Load #42"
                 value="" style="width:100%" autocomplete="off" />
        </div>
        <button class="btn btn-primary btn-full" id="proj-save-new" style="margin-bottom:16px">
          Save as New Project
        </button>
        <div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">
          Or overwrite an existing project:
        </div>
      ` : ''}

      <div id="proj-list-area" style="max-height:320px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-card)">
        <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">Loading projects…</div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button class="btn btn-secondary" id="proj-cancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // ── Close helpers ────────────────────────────────────────────────────────
  document.getElementById('proj-cancel')!.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  const listArea = document.getElementById('proj-list-area')!;
  const nameInput = document.getElementById('proj-name-input') as HTMLInputElement | null;
  if (nameInput) nameInput.focus();

  // ── Load projects list ───────────────────────────────────────────────────
  const loadProjectsList = async () => {
    try {
      const projects = await apiListProjects();

      if (projects.length === 0) {
        listArea.innerHTML = `
          <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">
            No saved projects yet.
            ${mode === 'save' ? 'Use the form above to save this load.' : ''}
          </div>
        `;
        return;
      }

      listArea.innerHTML = projects.map(p => {
        const date = new Date(p.updated_at).toLocaleDateString();
        return `
          <div class="proj-row" data-proj-id="${p.id}" style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--border-color);cursor:pointer">
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;font-weight:600;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
              <div style="font-size:10px;color:var(--text-muted)">by ${p.owner_name} · ${date}</div>
            </div>
            ${mode === 'load' ? `
              <button class="btn btn-sm btn-primary proj-load-btn" data-proj-id="${p.id}">Load</button>
            ` : `
              <button class="btn btn-sm btn-secondary proj-overwrite-btn" data-proj-id="${p.id}" data-proj-name="${p.name}">Overwrite</button>
            `}
            ${isEditor ? `
              <button class="btn btn-sm btn-danger proj-delete-btn" data-proj-id="${p.id}" title="Delete project">×</button>
            ` : ''}
          </div>
        `;
      }).join('');

      // ── Load button ──────────────────────────────────────────────────────
      listArea.querySelectorAll('.proj-load-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = Number((btn as HTMLElement).dataset.projId);
          try {
            (btn as HTMLButtonElement).disabled = true;
            (btn as HTMLButtonElement).textContent = '…';
            const project = await apiGetProject(id);
            overlay.remove();
            if (onLoad) onLoad(project.data as SavedLoad);
          } catch (err) {
            showToast((err as Error).message || 'Could not load project', 'error');
            (btn as HTMLButtonElement).disabled = false;
            (btn as HTMLButtonElement).textContent = 'Load';
          }
        });
      });

      // ── Overwrite button (save mode) ──────────────────────────────────────
      listArea.querySelectorAll('.proj-overwrite-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = Number((btn as HTMLElement).dataset.projId);
          const projName = (btn as HTMLElement).dataset.projName!;
          if (!confirm(`Overwrite project "${projName}" with the current load?`)) return;
          try {
            (btn as HTMLButtonElement).disabled = true;
            (btn as HTMLButtonElement).textContent = '…';
            await apiUpdateProject(id, { name: projName, data: saveData as object });
            overlay.remove();
            showToast(`Project "${projName}" updated!`, 'success');
          } catch (err) {
            showToast((err as Error).message || 'Could not update project', 'error');
            (btn as HTMLButtonElement).disabled = false;
            (btn as HTMLButtonElement).textContent = 'Overwrite';
          }
        });
      });

      // ── Delete button ─────────────────────────────────────────────────────
      listArea.querySelectorAll('.proj-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = Number((btn as HTMLElement).dataset.projId);
          const row = (btn as HTMLElement).closest('.proj-row') as HTMLElement;
          const name = row.querySelector('div > div')?.textContent || 'this project';
          if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
          try {
            (btn as HTMLButtonElement).disabled = true;
            await apiDeleteProject(id);
            showToast(`Project deleted`, 'success');
            await loadProjectsList(); // refresh
          } catch (err) {
            showToast((err as Error).message || 'Could not delete project', 'error');
            (btn as HTMLButtonElement).disabled = false;
          }
        });
      });

    } catch (err) {
      listArea.innerHTML = `
        <div style="padding:16px;color:var(--accent-red);font-size:12px">
          ✕ Could not load projects: ${(err as Error).message}
        </div>
      `;
    }
  };

  loadProjectsList();

  // ── Save New button ──────────────────────────────────────────────────────
  if (mode === 'save' && nameInput) {
    document.getElementById('proj-save-new')!.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) {
        showToast('Please enter a project name', 'error');
        nameInput.focus();
        return;
      }
      const btn = document.getElementById('proj-save-new') as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        const project = await apiCreateProject(name, saveData as object);
        overlay.remove();
        showToast(`Project "${project.name}" saved!`, 'success');
      } catch (err) {
        showToast((err as Error).message || 'Could not save project', 'error');
        btn.disabled = false;
        btn.textContent = 'Save as New Project';
      }
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('proj-save-new')?.click();
    });
  }
}
