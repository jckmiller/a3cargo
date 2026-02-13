
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ContainerSpec,
  CONTAINER_SPECS,
  CargoItem,
  CATEGORY_COLORS,
  ColorMode,
  SCALE_FACTOR,
  ITEM_COLORS,
  DEFAULT_GRID_SIZE,
  LibraryItemDef,
} from "./definitions";
import {
  createContainerMesh,
  createItemMesh,
  createGhostMesh,
  createSelectionHighlight,
  createStackingPlane,
  createGroundPlane,
  createEnvironment,
} from "./entities";
import {
  snapToGrid,
  inchesToUnits,
  unitsToInches,
  generateId,
  validatePlacement,
  getWeightColor,
  findStackingY,
  checkOverlap,
  rotateItemY,
  rotateItemTipForward,
  rotateItemTipSide,
} from "./utils";
import {
  buildUI,
  updateItemsList,
  updateStats,
  showItemInfo,
  showManifestModal,
  showEditItemModal,
  showToast,
  showValidationWarnings,
  updateDropIndicator,
  getNextColor,
  updateThemeIcon,
  updateLabelsToggleUI,
  UICallbacks,
} from "./ui";
import { ItemLabelManager } from "./labels";
import { generateLoadPlan, generateLoadPlanHTML, generatePrintableLoadPlan, LoadStep } from "./loadplan";
import { persistence } from "./libs/persistence";

export class ContainerVizApp {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private containerSpec: ContainerSpec = CONTAINER_SPECS['20ft'];
  private containerGroup: THREE.Group | null = null;
  private groundPlane: THREE.Mesh | null = null;
  private envGroup: THREE.Group | null = null;

  private items: CargoItem[] = [];
  private itemMeshes: Map<string, THREE.Group> = new Map();
  private selectedItemId: string | null = null;
  private selectionHighlight: THREE.Group | null = null;

  // Drag state
  private isDragging = false;
  private dragItem: CargoItem | null = null;
  private dragPlane: THREE.Mesh | null = null;
  private dragOffset = new THREE.Vector3();
  private dragStartPos = { x: 0, y: 0, z: 0 };
  private ghostMesh: THREE.Group | null = null;
  private shiftHeld = false;

  private snapEnabled = true;
  private gridSize = DEFAULT_GRID_SIZE;
  private gridVisible = true;
  private colorMode: ColorMode = 'custom';

  private animationId: number = 0;
  private mouseDownPos = { x: 0, y: 0 };
  private mouseDidDrag = false;

  // Theme
  private isDarkMode = true;

  // Labels
  private labelManager!: ItemLabelManager;

  // Store callbacks for external use
  private callbacks!: UICallbacks;

  constructor() {
    this.loadTheme();
    this.initUI();
    this.initThreeJS();
    this.buildContainer();
    this.setupEventListeners();
    this.animate();
  }

  private async loadTheme(): Promise<void> {
    try {
      const theme = await persistence.getItem('theme');
      if (theme === 'light') {
        this.isDarkMode = false;
        document.body.classList.add('light-mode');
      }
      updateThemeIcon(this.isDarkMode);
    } catch (e) { /* ignore */ }
  }

  private async toggleTheme(): Promise<void> {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
    updateThemeIcon(this.isDarkMode);
    this.updateSceneBackground();

    if (this.groundPlane) {
      const mat = this.groundPlane.material as THREE.MeshPhysicalMaterial;
      mat.color.setHex(this.isDarkMode ? 0x0f1219 : 0xdfe3ea);
      mat.needsUpdate = true;
    }

    try {
      await persistence.setItem('theme', this.isDarkMode ? 'dark' : 'light');
    } catch (e) { /* ignore */ }
  }

  private updateSceneBackground(): void {
    const bgColor = this.isDarkMode ? 0x0f1219 : 0xdfe3ea;
    this.scene.background = new THREE.Color(bgColor);
    if (this.scene.fog) {
      (this.scene.fog as THREE.Fog).color.setHex(bgColor);
    }
  }

  /**
   * Temporarily switch scene to light mode for snapshot capture, run the callback,
   * then restore original state.
   */
  private withLightSceneForSnapshot<T>(fn: () => T): T {
    const wasDark = this.isDarkMode;
    const origBg = (this.scene.background as THREE.Color)?.clone();
    const origFogColor = this.scene.fog ? (this.scene.fog as THREE.Fog).color.clone() : null;
    const origGroundColor = this.groundPlane
      ? (this.groundPlane.material as THREE.MeshPhysicalMaterial).color.clone()
      : null;

    // Switch to light palette
    const lightBg = 0xdfe3ea;
    this.scene.background = new THREE.Color(lightBg);
    if (this.scene.fog) {
      (this.scene.fog as THREE.Fog).color.setHex(lightBg);
    }
    if (this.groundPlane) {
      (this.groundPlane.material as THREE.MeshPhysicalMaterial).color.setHex(0xdfe3ea);
      (this.groundPlane.material as THREE.MeshPhysicalMaterial).needsUpdate = true;
    }

    // Boost ambient light for clarity
    let tempAmbient: THREE.AmbientLight | null = null;
    if (this.envGroup) {
      tempAmbient = new THREE.AmbientLight(0xffffff, 0.5);
      this.scene.add(tempAmbient);
    }

    let result: T;
    try {
      result = fn();
    } finally {
      // Restore original
      if (origBg) this.scene.background = origBg;
      if (origFogColor && this.scene.fog) {
        (this.scene.fog as THREE.Fog).color.copy(origFogColor);
      }
      if (origGroundColor && this.groundPlane) {
        (this.groundPlane.material as THREE.MeshPhysicalMaterial).color.copy(origGroundColor);
        (this.groundPlane.material as THREE.MeshPhysicalMaterial).needsUpdate = true;
      }
      if (tempAmbient) {
        this.scene.remove(tempAmbient);
        tempAmbient.dispose();
      }
    }

    return result;
  }

  private initUI(): void {
    this.callbacks = {
      onContainerChange: (name) => this.changeContainer(name),
      onAddItem: (data) => this.addItem(data),
      onAddItemFromLibrary: (def) => this.addItemFromLibrary(def),
      onSelectItem: (id) => this.selectItem(id),
      onDeleteItem: (id) => this.deleteItem(id),
      onToggleVisibility: (id) => this.toggleItemVisibility(id),
      onToggleGrid: (show) => this.toggleGrid(show),
      onToggleSnap: (snap) => { this.snapEnabled = snap; },
      onGridSizeChange: (size) => this.changeGridSize(size),
      onColorModeChange: (mode) => this.changeColorMode(mode),
      onResetView: () => this.resetView(),
      onExportImage: () => this.exportImage(),
      onShowManifest: () => this.showManifest(),
      onShowLoadPlan: () => this.showLoadPlan(),
      onMoveItem: (id, axis, delta) => this.moveItem(id, axis, delta),
      onToggleAllVisibility: (vis) => this.toggleAllVisibility(vis),
      onClearAll: () => this.clearAll(),
      onRotateItem: (id, type) => this.rotateItem(id, type),
      onToggleTheme: () => this.toggleTheme(),
      onToggleLabels: () => this.toggleLabels(),
      onEditItem: (id, changes) => this.editItem(id, changes),
    };
    buildUI(this.callbacks);
  }

  private initThreeJS(): void {
    const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
    const container = document.getElementById('viewport-container')!;

    this.scene = new THREE.Scene();
    this.updateSceneBackground();
    this.scene.fog = new THREE.Fog(this.isDarkMode ? 0x0f1219 : 0xdfe3ea, 15, 40);

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.01,
      100
    );
    this.camera.position.set(8, 6, 8);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 30;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.target.set(2, 0.5, 0.8);

    this.envGroup = createEnvironment();
    this.scene.add(this.envGroup);
    this.groundPlane = createGroundPlane();
    if (!this.isDarkMode) {
      (this.groundPlane.material as THREE.MeshPhysicalMaterial).color.setHex(0xdfe3ea);
    }
    this.scene.add(this.groundPlane);

    // Initialize label manager (now 3D-based, container element unused but kept for API compat)
    const labelsContainer = document.getElementById('labels-container')!;
    this.labelManager = new ItemLabelManager(labelsContainer);
    this.labelManager.setScene(this.scene);

    window.addEventListener('resize', () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    document.getElementById('btn-view-front')?.addEventListener('click', () => this.setView('front'));
    document.getElementById('btn-view-top')?.addEventListener('click', () => this.setView('top'));
    document.getElementById('btn-view-side')?.addEventListener('click', () => this.setView('side'));
    document.getElementById('btn-view-iso')?.addEventListener('click', () => this.setView('iso'));
  }

  private buildContainer(): void {
    if (this.containerGroup) {
      this.scene.remove(this.containerGroup);
    }

    this.containerGroup = createContainerMesh(this.containerSpec, this.gridSize);
    this.scene.add(this.containerGroup);

    const cx = inchesToUnits(this.containerSpec.lengthIn) / 2;
    const cy = inchesToUnits(this.containerSpec.heightIn) / 2;
    const cz = inchesToUnits(this.containerSpec.widthIn) / 2;
    this.controls.target.set(cx, cy, cz);

    this.updateAllItemMeshes();
    this.refreshUI();
  }

  private changeContainer(name: string): void {
    this.containerSpec = CONTAINER_SPECS[name];
    this.buildContainer();
    
    for (const item of this.items) {
      const result = validatePlacement(item, this.items, this.containerSpec);
      if (!result.valid) {
        showValidationWarnings(result);
      }
    }

    this.resetView();
  }

  private changeGridSize(size: number): void {
    this.gridSize = size;
    if (this.containerGroup) {
      this.scene.remove(this.containerGroup);
    }
    this.containerGroup = createContainerMesh(this.containerSpec, this.gridSize);
    this.scene.add(this.containerGroup);
    if (!this.gridVisible) {
      const grid = this.containerGroup.getObjectByName('floor-grid');
      if (grid) grid.visible = false;
    }
  }

  private addItem(data: Omit<CargoItem, 'id' | 'posX' | 'posY' | 'posZ' | 'visible' | 'color' | 'rotationY' | 'origLengthIn' | 'origWidthIn' | 'origHeightIn'>): void {
    if (data.lengthIn > this.containerSpec.lengthIn ||
        data.widthIn > this.containerSpec.widthIn ||
        data.heightIn > this.containerSpec.heightIn) {
      showToast('Item dimensions exceed container size!', 'error');
      return;
    }

    const item: CargoItem = {
      ...data,
      id: generateId(),
      posX: 0,
      posY: 0,
      posZ: 0,
      visible: true,
      color: this.colorMode === 'custom' ? getNextColor() :
             this.colorMode === 'category' ? CATEGORY_COLORS[data.category] :
             getWeightColor(data.weightLbs),
      rotationY: 0,
      origLengthIn: data.lengthIn,
      origWidthIn: data.widthIn,
      origHeightIn: data.heightIn,
    };

    this.autoPlace(item);

    this.items.push(item);
    this.createItemMeshInternal(item);
    this.labelManager.createLabel(item);
    this.selectItem(item.id);
    this.refreshUI();

    const result = validatePlacement(item, this.items, this.containerSpec);
    showValidationWarnings(result);
  }

  private addItemFromLibrary(def: LibraryItemDef): void {
    this.addItem({
      label: def.name,
      lengthIn: def.lengthIn,
      widthIn: def.widthIn,
      heightIn: def.heightIn,
      weightLbs: def.weightLbs,
      category: def.category,
    });
  }

  private autoPlace(item: CargoItem): void {
    const gridStep = this.snapEnabled ? this.gridSize : 1;
    
    for (let y = 0; y <= this.containerSpec.heightIn - item.heightIn; y += gridStep) {
      for (let x = 0; x <= this.containerSpec.lengthIn - item.lengthIn; x += gridStep) {
        for (let z = 0; z <= this.containerSpec.widthIn - item.widthIn; z += gridStep) {
          item.posX = x;
          item.posY = y;
          item.posZ = z;
          
          const result = validatePlacement(item, this.items, this.containerSpec);
          if (result.valid && result.warnings.length === 0) {
            return;
          }
        }
      }
    }

    item.posX = 0;
    item.posY = 0;
    item.posZ = 0;
    const stack = findStackingY(item, this.items, this.containerSpec);
    item.posY = stack.y;
  }

  private createItemMeshInternal(item: CargoItem): void {
    const mesh = createItemMesh(item);
    this.scene.add(mesh);
    this.itemMeshes.set(item.id, mesh);
  }

  private updateItemMesh(item: CargoItem): void {
    const oldMesh = this.itemMeshes.get(item.id);
    if (oldMesh) {
      this.scene.remove(oldMesh);
    }
    this.createItemMeshInternal(item);
    this.labelManager.updateLabel(item);
    this.updateSelectionHighlight();
  }

  private updateAllItemMeshes(): void {
    for (const [id, mesh] of this.itemMeshes) {
      this.scene.remove(mesh);
    }
    this.itemMeshes.clear();
    this.labelManager.removeAll();
    for (const item of this.items) {
      this.createItemMeshInternal(item);
      this.labelManager.createLabel(item);
    }
    this.updateSelectionHighlight();
  }

  private selectItem(id: string | null): void {
    this.selectedItemId = id;
    const item = id ? this.items.find(i => i.id === id) || null : null;
    showItemInfo(item, this.gridSize);
    this.updateSelectionHighlight();
    this.refreshItemsList();
  }

  private updateSelectionHighlight(): void {
    if (this.selectionHighlight) {
      this.scene.remove(this.selectionHighlight);
      this.selectionHighlight = null;
    }

    if (this.selectedItemId) {
      const item = this.items.find(i => i.id === this.selectedItemId);
      if (item) {
        this.selectionHighlight = createSelectionHighlight(item);
        this.scene.add(this.selectionHighlight);
      }
    }
  }

  private deleteItem(id: string): void {
    this.items = this.items.filter(i => i.id !== id);
    const mesh = this.itemMeshes.get(id);
    if (mesh) {
      this.scene.remove(mesh);
      this.itemMeshes.delete(id);
    }
    this.labelManager.removeLabel(id);
    if (this.selectedItemId === id) {
      this.selectItem(null);
    }
    this.refreshUI();
  }

  private toggleItemVisibility(id: string): void {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.visible = !item.visible;
      const mesh = this.itemMeshes.get(id);
      if (mesh) mesh.visible = item.visible;
      this.labelManager.syncVisibility(item);
      this.refreshItemsList();
    }
  }

  private toggleAllVisibility(visible: boolean): void {
    for (const item of this.items) {
      item.visible = visible;
      const mesh = this.itemMeshes.get(item.id);
      if (mesh) mesh.visible = visible;
      this.labelManager.syncVisibility(item);
    }
    this.refreshItemsList();
  }

  private toggleGrid(show: boolean): void {
    this.gridVisible = show;
    if (this.containerGroup) {
      const grid = this.containerGroup.getObjectByName('floor-grid');
      if (grid) grid.visible = show;
    }
  }

  private toggleLabels(): void {
    const isVisible = this.labelManager.toggle();
    updateLabelsToggleUI(isVisible);
    showToast(isVisible ? '3D item tags enabled' : '3D item tags disabled', 'success');
  }

  private changeColorMode(mode: ColorMode): void {
    this.colorMode = mode;
    for (const item of this.items) {
      if (mode === 'category') {
        item.color = CATEGORY_COLORS[item.category];
      } else if (mode === 'weight') {
        item.color = getWeightColor(item.weightLbs);
      }
    }
    this.updateAllItemMeshes();
    this.refreshItemsList();
  }

  /**
   * Edit an existing item's properties (label, dims, weight, category, color).
   */
  private editItem(
    id: string,
    changes: Partial<Pick<CargoItem, 'label' | 'lengthIn' | 'widthIn' | 'heightIn' | 'weightLbs' | 'category' | 'color'>>
  ): void {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    const oldLabel = item.label;
    const oldLengthIn = item.lengthIn;
    const oldWidthIn = item.widthIn;
    const oldHeightIn = item.heightIn;
    const oldWeightLbs = item.weightLbs;
    const oldCategory = item.category;
    const oldColor = item.color;
    const oldOrigL = item.origLengthIn;
    const oldOrigW = item.origWidthIn;
    const oldOrigH = item.origHeightIn;

    if (changes.label !== undefined) item.label = changes.label;
    if (changes.weightLbs !== undefined) item.weightLbs = changes.weightLbs;
    if (changes.category !== undefined) item.category = changes.category;
    if (changes.color !== undefined) item.color = changes.color;

    const dimsChanged = changes.lengthIn !== undefined || changes.widthIn !== undefined || changes.heightIn !== undefined;

    if (dimsChanged) {
      if (changes.lengthIn !== undefined) {
        item.lengthIn = changes.lengthIn;
        item.origLengthIn = changes.lengthIn;
      }
      if (changes.widthIn !== undefined) {
        item.widthIn = changes.widthIn;
        item.origWidthIn = changes.widthIn;
      }
      if (changes.heightIn !== undefined) {
        item.heightIn = changes.heightIn;
        item.origHeightIn = changes.heightIn;
      }
      item.rotationY = 0;

      item.posX = Math.max(0, Math.min(item.posX, this.containerSpec.lengthIn - item.lengthIn));
      item.posZ = Math.max(0, Math.min(item.posZ, this.containerSpec.widthIn - item.widthIn));
      item.posY = Math.max(0, Math.min(item.posY, this.containerSpec.heightIn - item.heightIn));

      if (this.snapEnabled) {
        item.posX = snapToGrid(item.posX, this.gridSize);
        item.posZ = snapToGrid(item.posZ, this.gridSize);
        item.posY = snapToGrid(item.posY, this.gridSize);
      }

      const stack = findStackingY(item, this.items, this.containerSpec);
      item.posY = Math.max(item.posY, stack.y);
      if (this.snapEnabled) {
        item.posY = snapToGrid(item.posY, this.gridSize);
      }
    }

    const result = validatePlacement(item, this.items, this.containerSpec);
    if (!result.valid && dimsChanged) {
      const savedX = item.posX, savedY = item.posY, savedZ = item.posZ;
      
      const otherItems = this.items.filter(i => i.id !== item.id);
      let placed = false;

      const levels = new Set<number>();
      levels.add(0);
      for (const other of otherItems) {
        levels.add(other.posY + other.heightIn);
      }
      for (const y of Array.from(levels).sort((a, b) => a - b)) {
        item.posY = this.snapEnabled ? snapToGrid(y, this.gridSize) : y;
        item.posX = savedX;
        item.posZ = savedZ;
        const recheck = validatePlacement(item, this.items, this.containerSpec);
        if (recheck.valid) {
          placed = true;
          break;
        }
      }

      if (!placed) {
        const idx = this.items.indexOf(item);
        this.items.splice(idx, 1);
        this.autoPlace(item);
        this.items.splice(idx, 0, item);

        const finalCheck = validatePlacement(item, this.items, this.containerSpec);
        if (!finalCheck.valid) {
          item.label = oldLabel;
          item.lengthIn = oldLengthIn;
          item.widthIn = oldWidthIn;
          item.heightIn = oldHeightIn;
          item.weightLbs = oldWeightLbs;
          item.category = oldCategory;
          item.color = oldColor;
          item.origLengthIn = oldOrigL;
          item.origWidthIn = oldOrigW;
          item.origHeightIn = oldOrigH;
          item.posX = savedX;
          item.posY = savedY;
          item.posZ = savedZ;
          showToast('Cannot resize -- new dimensions cause overlap or exceed container', 'error');
          return;
        }
      }
    }

    if (this.colorMode === 'category') {
      item.color = CATEGORY_COLORS[item.category];
    } else if (this.colorMode === 'weight') {
      item.color = getWeightColor(item.weightLbs);
    }

    this.updateItemMesh(item);
    showItemInfo(item, this.gridSize);
    this.refreshUI();

    const changeSummary: string[] = [];
    if (changes.label !== undefined && changes.label !== oldLabel) changeSummary.push(`label -> "${changes.label}"`);
    if (changes.weightLbs !== undefined && changes.weightLbs !== oldWeightLbs) changeSummary.push(`weight -> ${changes.weightLbs.toLocaleString()} lbs`);
    if (changes.category !== undefined && changes.category !== oldCategory) changeSummary.push(`category -> ${changes.category}`);
    if (changes.lengthIn !== undefined && changes.lengthIn !== oldLengthIn) changeSummary.push(`L -> ${changes.lengthIn}"`);
    if (changes.widthIn !== undefined && changes.widthIn !== oldWidthIn) changeSummary.push(`W -> ${changes.widthIn}"`);
    if (changes.heightIn !== undefined && changes.heightIn !== oldHeightIn) changeSummary.push(`H -> ${changes.heightIn}"`);
    if (changes.color !== undefined && changes.color !== oldColor) changeSummary.push(`color updated`);

    if (changeSummary.length > 0) {
      showToast(`Updated "${item.label}": ${changeSummary.join(', ')}`, 'success');
    }

    const finalResult = validatePlacement(item, this.items, this.containerSpec);
    if (finalResult.warnings.length > 0) {
      showValidationWarnings(finalResult);
    }
  }

  private openEditModal(id: string): void {
    const item = this.items.find(i => i.id === id);
    if (!item) {
      showToast('No item selected to edit', 'warning');
      return;
    }
    showEditItemModal(item, this.callbacks);
  }

  private rotateItem(id: string, rotationType: string): void {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    const oldL = item.lengthIn;
    const oldW = item.widthIn;
    const oldH = item.heightIn;
    const oldPosX = item.posX;
    const oldPosY = item.posY;
    const oldPosZ = item.posZ;
    const oldRot = item.rotationY;

    if (rotationType === 'y') {
      rotateItemY(item);
    } else if (rotationType === 'tipForward') {
      rotateItemTipForward(item);
    } else if (rotationType === 'tipSide') {
      rotateItemTipSide(item);
    }

    item.posX = Math.min(item.posX, Math.max(0, this.containerSpec.lengthIn - item.lengthIn));
    item.posZ = Math.min(item.posZ, Math.max(0, this.containerSpec.widthIn - item.widthIn));
    item.posY = Math.min(item.posY, Math.max(0, this.containerSpec.heightIn - item.heightIn));

    if (this.snapEnabled) {
      item.posX = snapToGrid(item.posX, this.gridSize);
      item.posZ = snapToGrid(item.posZ, this.gridSize);
      item.posY = snapToGrid(item.posY, this.gridSize);
    }

    const stack = findStackingY(item, this.items, this.containerSpec);
    item.posY = Math.max(item.posY, stack.y);
    if (this.snapEnabled) {
      item.posY = snapToGrid(item.posY, this.gridSize);
    }

    const result = validatePlacement(item, this.items, this.containerSpec);
    if (!result.valid) {
      item.lengthIn = oldL;
      item.widthIn = oldW;
      item.heightIn = oldH;
      item.posX = oldPosX;
      item.posY = oldPosY;
      item.posZ = oldPosZ;
      item.rotationY = oldRot;
      showToast('Cannot rotate -- would cause overlap or exceed container', 'error');
      return;
    }

    if (result.warnings.length > 0) {
      showValidationWarnings(result);
    }

    this.updateItemMesh(item);
    showItemInfo(item, this.gridSize);
    this.refreshUI();
    
    const rotDeg = item.rotationY * 90;
    showToast(`Rotated "${item.label}" -> ${item.lengthIn}"x${item.widthIn}"x${item.heightIn}" (${rotDeg} deg)`, 'success');
  }

  private moveItem(id: string, axis: 'x' | 'y' | 'z', delta: number): void {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    const oldX = item.posX, oldY = item.posY, oldZ = item.posZ;

    if (axis === 'x') item.posX = Math.max(0, item.posX + delta);
    else if (axis === 'y') item.posY = Math.max(0, item.posY + delta);
    else if (axis === 'z') item.posZ = Math.max(0, item.posZ + delta);

    if (this.snapEnabled) {
      item.posX = snapToGrid(item.posX, this.gridSize);
      item.posY = snapToGrid(item.posY, this.gridSize);
      item.posZ = snapToGrid(item.posZ, this.gridSize);
    }

    const result = validatePlacement(item, this.items, this.containerSpec);
    if (!result.valid) {
      item.posX = oldX;
      item.posY = oldY;
      item.posZ = oldZ;
      showValidationWarnings(result);
      return;
    }

    if (result.warnings.length > 0) {
      showValidationWarnings(result);
    }

    this.updateItemMesh(item);
    showItemInfo(item, this.gridSize);
    this.refreshUI();
  }

  private clearAll(): void {
    for (const [id, mesh] of this.itemMeshes) {
      this.scene.remove(mesh);
    }
    this.itemMeshes.clear();
    this.labelManager.removeAll();
    this.items = [];
    this.selectItem(null);
    this.refreshUI();
  }

  private resetView(): void {
    const cx = inchesToUnits(this.containerSpec.lengthIn) / 2;
    const cy = inchesToUnits(this.containerSpec.heightIn) / 2;
    const cz = inchesToUnits(this.containerSpec.widthIn) / 2;
    
    const maxDim = Math.max(
      inchesToUnits(this.containerSpec.lengthIn),
      inchesToUnits(this.containerSpec.widthIn),
      inchesToUnits(this.containerSpec.heightIn)
    );

    this.animateCamera(
      new THREE.Vector3(cx + maxDim * 1.5, cy + maxDim * 1.2, cz + maxDim * 1.5),
      new THREE.Vector3(cx, cy, cz)
    );
  }

  private setView(view: 'front' | 'top' | 'side' | 'iso'): void {
    const cx = inchesToUnits(this.containerSpec.lengthIn) / 2;
    const cy = inchesToUnits(this.containerSpec.heightIn) / 2;
    const cz = inchesToUnits(this.containerSpec.widthIn) / 2;
    const maxDim = Math.max(
      inchesToUnits(this.containerSpec.lengthIn),
      inchesToUnits(this.containerSpec.heightIn)
    ) * 1.8;

    let pos: THREE.Vector3;
    const target = new THREE.Vector3(cx, cy, cz);

    switch (view) {
      case 'front':
        pos = new THREE.Vector3(cx, cy, cz + maxDim);
        break;
      case 'top':
        pos = new THREE.Vector3(cx, cy + maxDim, cz + 0.01);
        break;
      case 'side':
        pos = new THREE.Vector3(cx + maxDim, cy, cz);
        break;
      case 'iso':
      default:
        pos = new THREE.Vector3(cx + maxDim * 0.8, cy + maxDim * 0.6, cz + maxDim * 0.8);
        break;
    }

    this.animateCamera(pos, target);
  }

  private animateCamera(targetPos: THREE.Vector3, targetLookAt: THREE.Vector3): void {
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const duration = 600;
    const startTime = performance.now();

    const anim = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.controls.target.lerpVectors(startTarget, targetLookAt, ease);
      this.controls.update();

      if (t < 1) requestAnimationFrame(anim);
    };
    anim();
  }

  private exportImage(): void {
    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `a3-shipping-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    showToast('Image exported successfully!', 'success');
  }

  /**
   * Get a scene snapshot using light mode for print-friendly output.
   */
  private getSceneSnapshotForPrint(): string {
    return this.withLightSceneForSnapshot(() => {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    });
  }

  private showManifest(): void {
    const snapshot = this.getSceneSnapshotForPrint();
    showManifestModal(this.items, this.containerSpec, snapshot, () => {});
  }

  /**
   * Generate step-by-step load plan with incremental snapshots (light mode).
   */
  private showLoadPlan(): void {
    if (this.items.length === 0) {
      showToast('Add items to the container first to generate a load plan', 'warning');
      return;
    }

    const steps = generateLoadPlan(this.items, this.containerSpec);
    
    // Save original visibility
    const originalVisibility: Map<string, boolean> = new Map();
    for (const item of this.items) {
      originalVisibility.set(item.id, item.visible);
    }

    // Hide all items
    for (const item of this.items) {
      item.visible = false;
      const mesh = this.itemMeshes.get(item.id);
      if (mesh) mesh.visible = false;
    }

    // Temporarily hide labels for clean snapshots
    const labelsWereVisible = this.labelManager.isVisible;
    this.labelManager.setVisible(false);

    // Generate snapshots for each step in light mode
    this.withLightSceneForSnapshot(() => {
      for (const step of steps) {
        step.item.visible = true;
        const mesh = this.itemMeshes.get(step.item.id);
        if (mesh) mesh.visible = true;

        this.renderer.render(this.scene, this.camera);
        const snapshot = this.renderer.domElement.toDataURL('image/jpeg', 0.85);
        step.snapshotDataUrl = snapshot;
      }
    });

    // Restore visibility
    for (const item of this.items) {
      const wasVisible = originalVisibility.get(item.id) ?? true;
      item.visible = wasVisible;
      const mesh = this.itemMeshes.get(item.id);
      if (mesh) mesh.visible = wasVisible;
    }

    this.labelManager.setVisible(labelsWereVisible);

    this.showLoadPlanModal(steps);
  }

  private showLoadPlanModal(steps: LoadStep[]): void {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal large" style="position:relative" id="loadplan-modal">
        <h2>Step-by-Step Load Plan</h2>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">
          Container: <strong style="color:var(--text-bright)">${this.containerSpec.label}</strong> &nbsp;|&nbsp;
          ${this.containerSpec.lengthIn}" x ${this.containerSpec.widthIn}" x ${this.containerSpec.heightIn}" &nbsp;|&nbsp;
          ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
        </div>
        ${generateLoadPlanHTML(steps, this.containerSpec, this.items)}
        <div class="pdf-export-section">
          <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
            <button class="btn btn-secondary" id="loadplan-close">Close</button>
            <button class="btn btn-secondary" id="loadplan-copy">Copy Text</button>
            <button class="btn btn-primary" id="loadplan-print">Print Load Plan</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.getElementById('loadplan-close')!.addEventListener('click', () => overlay.remove());

    document.getElementById('loadplan-copy')!.addEventListener('click', () => {
      const text = this.generateLoadPlanText(steps);
      navigator.clipboard.writeText(text).then(() => {
        showToast('Load plan copied to clipboard!', 'success');
      }).catch(() => {
        showToast('Could not copy to clipboard', 'error');
      });
    });

    document.getElementById('loadplan-print')!.addEventListener('click', () => {
      const html = generatePrintableLoadPlan(steps, this.containerSpec, this.items);
      try {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (win) {
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          showToast('Print window opened', 'success');
        } else {
          const link = document.createElement('a');
          link.href = url;
          link.download = `a3-loadplan-${Date.now()}.html`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          showToast('Load plan downloaded as HTML', 'success');
        }
      } catch (e) {
        showToast('Could not generate printable load plan', 'error');
      }
    });
  }

  private generateLoadPlanText(steps: LoadStep[]): string {
    let text = `A3 SHIPPING PRO - STEP-BY-STEP LOAD PLAN\n`;
    text += `${'='.repeat(60)}\n`;
    text += `Container: ${this.containerSpec.label}\n`;
    text += `Date: ${new Date().toLocaleString()}\n\n`;

    for (const step of steps) {
      text += `STEP ${step.stepNumber}: ${step.item.label}\n`;
      text += `${'-'.repeat(40)}\n`;
      text += `Dimensions: ${step.item.lengthIn}" x ${step.item.widthIn}" x ${step.item.heightIn}"\n`;
      text += `Weight: ${step.item.weightLbs.toLocaleString()} lbs\n`;
      text += `Position: X=${step.item.posX.toFixed(0)}", Y=${step.item.posY.toFixed(0)}", Z=${step.item.posZ.toFixed(0)}"\n`;
      text += `\nInstruction: ${step.instruction}\n`;
      if (step.tips.length > 0) {
        text += `\nTips:\n`;
        for (const tip of step.tips) {
          text += `  - ${tip}\n`;
        }
      }
      text += `\nCumulative: ${step.cumulativeWeight.toLocaleString()} lbs, ${step.cumulativeUtilization.toFixed(1)}% volume\n\n`;
    }

    return text;
  }

  private refreshUI(): void {
    updateStats(this.items, this.containerSpec);
    this.refreshItemsList();
  }

  private refreshItemsList(): void {
    updateItemsList(this.items, this.selectedItemId, {
      onSelect: (id) => this.selectItem(id),
      onDelete: (id) => this.deleteItem(id),
      onToggleVis: (id) => this.toggleItemVisibility(id),
      onEdit: (id) => this.openEditModal(id),
    });
  }

  private setupEventListeners(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.shiftHeld = true;

      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
      const modalOpen = document.querySelector('.modal-overlay') !== null;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedItemId && !isInput && !modalOpen) {
          this.deleteItem(this.selectedItemId);
        }
      }

      if ((e.key === 'r' || e.key === 'R') && !isInput && !modalOpen) {
        if (this.selectedItemId) {
          this.rotateItem(this.selectedItemId, 'y');
        }
      }

      if ((e.key === 't' || e.key === 'T') && !isInput && !modalOpen) {
        if (this.selectedItemId) {
          this.rotateItem(this.selectedItemId, 'tipForward');
        }
      }

      if ((e.key === 'e' || e.key === 'E') && !isInput && !modalOpen) {
        if (this.selectedItemId) {
          this.openEditModal(this.selectedItemId);
        } else {
          showToast('Select an item first to edit', 'warning');
        }
      }

      if ((e.key === 'l' || e.key === 'L') && !isInput && !modalOpen) {
        this.toggleLabels();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.shiftHeld = false;
    });

    window.addEventListener('moveItem', ((e: CustomEvent) => {
      const { id, axis, delta } = e.detail;
      this.moveItem(id, axis, delta);
    }) as EventListener);

    window.addEventListener('rotateItem', ((e: CustomEvent) => {
      const { id, rotationType } = e.detail;
      this.rotateItem(id, rotationType);
    }) as EventListener);

    window.addEventListener('rotateSelected', ((e: CustomEvent) => {
      if (this.selectedItemId) {
        this.rotateItem(this.selectedItemId, e.detail.type);
      } else {
        showToast('No item selected to rotate', 'warning');
      }
    }) as EventListener);

    window.addEventListener('editSelected', (() => {
      if (this.selectedItemId) {
        this.openEditModal(this.selectedItemId);
      } else {
        showToast('No item selected to edit', 'warning');
      }
    }) as EventListener);

    window.addEventListener('editItem', ((e: CustomEvent) => {
      this.openEditModal(e.detail.id);
    }) as EventListener);
  }

  private getMouseNDC(event: MouseEvent): THREE.Vector2 {
    const container = document.getElementById('viewport-container')!;
    const rect = container.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  private raycastItems(ndc: THREE.Vector2): { item: CargoItem; point: THREE.Vector3 } | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    
    const meshes: THREE.Object3D[] = [];
    for (const [id, group] of this.itemMeshes) {
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.name === 'item-box') {
          meshes.push(child);
        }
      });
    }

    const intersects = this.raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      const hit = intersects[0];
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData?.itemId) {
          const item = this.items.find(i => i.id === obj!.userData.itemId);
          if (item && item.visible) return { item, point: hit.point };
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;

    this.mouseDownPos = { x: event.clientX, y: event.clientY };
    this.mouseDidDrag = false;

    const ndc = this.getMouseNDC(event);
    const hit = this.raycastItems(ndc);

    if (hit) {
      this.selectItem(hit.item.id);
      
      this.dragItem = hit.item;
      this.dragStartPos = { x: hit.item.posX, y: hit.item.posY, z: hit.item.posZ };
      this.controls.enabled = false;

      if (this.dragPlane) this.scene.remove(this.dragPlane);
      this.dragPlane = createStackingPlane(this.containerSpec, hit.item.posY);
      this.scene.add(this.dragPlane);

      this.raycaster.setFromCamera(ndc, this.camera);
      const planeIntersects = this.raycaster.intersectObject(this.dragPlane);
      if (planeIntersects.length > 0) {
        const point = planeIntersects[0].point;
        this.dragOffset.set(
          point.x - inchesToUnits(hit.item.posX),
          0,
          point.z - inchesToUnits(hit.item.posZ)
        );
      }

      if (this.ghostMesh) this.scene.remove(this.ghostMesh);
      this.ghostMesh = createGhostMesh(hit.item);
      this.scene.add(this.ghostMesh);
    } else {
      this.selectItem(null);
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.dragItem || !this.dragPlane) return;

    const dx = event.clientX - this.mouseDownPos.x;
    const dy = event.clientY - this.mouseDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5 && !this.isDragging) return;

    if (!this.isDragging) {
      this.isDragging = true;
      this.mouseDidDrag = true;
    }

    const ndc = this.getMouseNDC(event);
    this.raycaster.setFromCamera(ndc, this.camera);
    const intersects = this.raycaster.intersectObject(this.dragPlane);
    
    if (intersects.length > 0) {
      const point = intersects[0].point;
      let newX = unitsToInches(point.x - this.dragOffset.x);
      let newZ = unitsToInches(point.z - this.dragOffset.z);

      if (this.snapEnabled) {
        newX = snapToGrid(newX, this.gridSize);
        newZ = snapToGrid(newZ, this.gridSize);
      }

      newX = Math.max(0, Math.min(newX, this.containerSpec.lengthIn - this.dragItem.lengthIn));
      newZ = Math.max(0, Math.min(newZ, this.containerSpec.widthIn - this.dragItem.widthIn));

      this.dragItem.posX = newX;
      this.dragItem.posZ = newZ;

      if (!this.shiftHeld) {
        const stackResult = findStackingY(this.dragItem, this.items, this.containerSpec);
        this.dragItem.posY = stackResult.y;

        if (this.snapEnabled) {
          this.dragItem.posY = snapToGrid(this.dragItem.posY, this.gridSize);
        }

        if (stackResult.stackedOn) {
          updateDropIndicator(
            `Stacking on "${stackResult.stackedOn.label}" at Y=${this.dragItem.posY.toFixed(0)}"`,
            true
          );
        } else {
          updateDropIndicator(
            `Floor level - X:${newX.toFixed(0)}" Z:${newZ.toFixed(0)}"`,
            false
          );
        }
      } else {
        this.dragItem.posY = 0;
        updateDropIndicator('Shift: Floor level forced', false);
      }

      const mesh = this.itemMeshes.get(this.dragItem.id);
      if (mesh) {
        mesh.position.x = inchesToUnits(newX);
        mesh.position.y = inchesToUnits(this.dragItem.posY);
        mesh.position.z = inchesToUnits(newZ);
      }

      if (this.ghostMesh) {
        this.ghostMesh.visible = true;
        this.ghostMesh.position.set(
          inchesToUnits(newX),
          inchesToUnits(this.dragItem.posY),
          inchesToUnits(newZ)
        );

        const tempItem = { ...this.dragItem };
        const result = validatePlacement(tempItem, this.items, this.containerSpec);
        
        this.ghostMesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
            const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
            if (mat.opacity < 0.5) {
              mat.color.setHex(result.valid ? 0x34d399 : 0xf87171);
            }
          }
        });
      }

      this.updateSelectionHighlight();

      if (this.dragPlane) {
        this.dragPlane.position.y = inchesToUnits(this.dragItem.posY);
      }
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (this.isDragging && this.dragItem) {
      const result = validatePlacement(this.dragItem, this.items, this.containerSpec);
      
      if (!result.valid) {
        const hasOverlap = result.errors.some(e => e.includes('overlaps'));
        if (hasOverlap) {
          let foundValid = false;
          const otherItems = this.items.filter(i => i.id !== this.dragItem!.id);
          
          const levels = new Set<number>();
          levels.add(0);
          for (const other of otherItems) {
            const overlapX = Math.min(this.dragItem.posX + this.dragItem.lengthIn, other.posX + other.lengthIn) -
                             Math.max(this.dragItem.posX, other.posX);
            const overlapZ = Math.min(this.dragItem.posZ + this.dragItem.widthIn, other.posZ + other.widthIn) -
                             Math.max(this.dragItem.posZ, other.posZ);
            if (overlapX > 0.5 && overlapZ > 0.5) {
              levels.add(other.posY + other.heightIn);
            }
          }

          const sortedLevels = Array.from(levels).sort((a, b) => a - b);
          for (const y of sortedLevels) {
            this.dragItem.posY = this.snapEnabled ? snapToGrid(y, this.gridSize) : y;
            const recheck = validatePlacement(this.dragItem, this.items, this.containerSpec);
            if (recheck.valid) {
              foundValid = true;
              break;
            }
          }

          if (!foundValid) {
            this.dragItem.posX = this.dragStartPos.x;
            this.dragItem.posY = this.dragStartPos.y;
            this.dragItem.posZ = this.dragStartPos.z;
            showToast('Could not place item there -- reverted to original position', 'warning');
          }
        } else {
          this.dragItem.posX = this.dragStartPos.x;
          this.dragItem.posY = this.dragStartPos.y;
          this.dragItem.posZ = this.dragStartPos.z;
          showValidationWarnings(result);
        }
      }

      const finalResult = validatePlacement(this.dragItem, this.items, this.containerSpec);
      if (finalResult.warnings.length > 0) {
        showValidationWarnings(finalResult);
      }

      this.updateItemMesh(this.dragItem);
      showItemInfo(this.dragItem, this.gridSize);
      this.refreshUI();
    }

    this.isDragging = false;
    this.dragItem = null;
    this.controls.enabled = true;
    updateDropIndicator(null);

    if (this.dragPlane) {
      this.scene.remove(this.dragPlane);
      this.dragPlane = null;
    }

    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
  }

  private onDoubleClick(event: MouseEvent): void {
    const ndc = this.getMouseNDC(event);
    const hit = this.raycastItems(ndc);
    if (hit) {
      this.selectItem(hit.item.id);
      showItemInfo(hit.item, this.gridSize);
    }
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();

    if (this.selectionHighlight) {
      const t = performance.now() * 0.003;
      this.selectionHighlight.children.forEach(child => {
        if ((child as THREE.Mesh).material && 'opacity' in (child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          if (mat.color.getHex() === 0x5b8af5) {
            mat.opacity = 0.06 + Math.sin(t) * 0.06;
          }
        }
      });
    }

    this.renderer.render(this.scene, this.camera);
  };
}
