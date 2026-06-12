/**
 * 3D Item Label Manager
 * 
 * Manages text labels rendered as 3D canvas textures on cargo item surfaces.
 * Labels are displayed on:
 * - Top face (primary visibility from above)
 * - Front face (when viewing from front)
 * - Side face (when viewing from side)
 * 
 * Each label includes:
 * - Item name/label
 * - Category and weight
 * - Dimensions
 * 
 * Labels use dynamic canvas textures that scale based on item size for consistent readability.
 */

import * as THREE from "three";
import { CargoItem, HAZMAT_CLASSES } from "./definitions";
import { inchesToUnits } from "./utils";

/**
 * Manages 3D text labels for cargo items.
 * Labels are rendered as canvas textures applied to planes positioned on item faces.
 * Supports global visibility toggle and per-item synchronization.
 * 
 * @example
 * const labelManager = new ItemLabelManager(container);
 * labelManager.setScene(scene);
 * labelManager.createLabel(item);
 * labelManager.toggle(); // Show/hide all labels
 */
export class ItemLabelManager {
  /** Map of item IDs to their label mesh groups */
  private labelMeshes: Map<string, THREE.Group> = new Map();
  
  /** Reference to the Three.js scene for adding/removing label meshes */
  private parentScene: THREE.Scene | null = null;
  
  /** Global visibility state for all labels */
  private visible: boolean = true;

  /**
   * Creates a new label manager.
   * @param _container - HTML container element (legacy parameter, no longer used)
   */
  constructor(_container: HTMLElement) {
    // Container element no longer needed; labels are 3D objects
  }

  /**
   * Sets the Three.js scene reference for label management.
   * Must be called before creating any labels.
   * 
   * @param scene - Three.js scene to add labels to
   */
  setScene(scene: THREE.Scene): void {
    this.parentScene = scene;
  }

  /**
   * Gets the current global visibility state.
   * @returns true if labels are visible, false if hidden
   */
  get isVisible(): boolean {
    return this.visible;
  }

  /**
   * Sets the global visibility for all labels.
   * @param v - true to show labels, false to hide
   */
  setVisible(v: boolean): void {
    this.visible = v;
    for (const group of this.labelMeshes.values()) {
      group.visible = v;
    }
  }

  /**
   * Toggles the global visibility of all labels.
   * @returns The new visibility state
   */
  toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  /**
   * Creates 3D label meshes for a cargo item.
   * Generates labels for top, front, and side faces with appropriate scaling.
   * Automatically removes any existing label for the same item first.
   * 
   * @param item - Cargo item to create labels for
   */
  createLabel(item: CargoItem): void {
    this.removeLabel(item.id);
    if (!this.parentScene) return;

    const group = this.buildLabelGroup(item);
    group.visible = this.visible && item.visible;
    this.parentScene.add(group);
    this.labelMeshes.set(item.id, group);
  }

  /**
   * Removes the label meshes for a specific item.
   * Properly disposes of geometries, materials, and textures to prevent memory leaks.
   * 
   * @param id - ID of the item whose label should be removed
   */
  removeLabel(id: string): void {
    const group = this.labelMeshes.get(id);
    if (group) {
      if (this.parentScene) this.parentScene.remove(group);
      
      // Dispose of all geometries, materials, and textures
      group.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material as THREE.Material;
          if ((mat as any).map) (mat as any).map.dispose();
          mat.dispose();
        }
      });
      
      this.labelMeshes.delete(id);
    }
  }

  /**
   * Removes all label meshes from the scene.
   * Useful when clearing the container or resetting.
   */
  removeAll(): void {
    for (const id of Array.from(this.labelMeshes.keys())) {
      this.removeLabel(id);
    }
  }

  /**
   * Updates the label for an item (removes old, creates new).
   * Used when item properties change that affect the label display.
   * 
   * @param item - Updated cargo item
   */
  updateLabel(item: CargoItem): void {
    this.removeLabel(item.id);
    this.createLabel(item);
  }

  /**
   * Synchronizes label visibility with item visibility.
   * Called when an item is hidden/shown to update its label accordingly.
   * 
   * @param item - Item whose label visibility should sync
   */
  syncVisibility(item: CargoItem): void {
    const group = this.labelMeshes.get(item.id);
    if (group) {
      group.visible = this.visible && item.visible;
    }
  }

  /**
   * Builds a complete label group for an item with labels on multiple faces.
   * Creates canvas textures and positions them on top, front, and side faces.
   * When the item has a hazmat classification, a prominent HAZMAT + class number
   * stripe is drawn on every face label instead of the generic label shape.
   *
   * @param item - Cargo item to build labels for
   * @returns THREE.Group containing all label planes
   */
  private buildLabelGroup(item: CargoItem): THREE.Group {
    const group = new THREE.Group();
    group.name = `label-${item.id}`;

    const l = inchesToUnits(item.lengthIn);
    const w = inchesToUnits(item.widthIn);
    const h = inchesToUnits(item.heightIn);

    // Resolve hazmat info (null when not classified)
    const hazmatInfo = (item.hazmatLevel && item.hazmatLevel !== 'none')
      ? HAZMAT_CLASSES[item.hazmatLevel]
      : null;

    // Format label text
    const catLabel = this.getCategoryLabel(item.category);
    const weightStr = item.weightLbs >= 1000
      ? (item.weightLbs / 1000).toFixed(1) + 'k lbs'
      : item.weightLbs + ' lbs';
    const dimsStr = `${item.lengthIn} x ${item.widthIn} x ${item.heightIn}"`;

    const primaryLine = item.label;
    const secondaryLine = `${catLabel} | ${weightStr}`;
    const tertiaryLine = dimsStr;

    // --- TOP FACE LABEL ---
    // Most visible when viewing from above (typical angle)
    const topTexture = this.createTextTexture(
      primaryLine, secondaryLine, tertiaryLine, item.color, l, w, hazmatInfo
    );
    const topGeom = new THREE.PlaneGeometry(l * 0.92, w * 0.92);
    const topMat = new THREE.MeshBasicMaterial({
      map: topTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,  // Prevents z-fighting with item surface
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const topMesh = new THREE.Mesh(topGeom, topMat);
    topMesh.rotation.x = -Math.PI / 2;  // Horizontal
    topMesh.position.set(
      inchesToUnits(item.posX) + l / 2,
      inchesToUnits(item.posY) + h + 0.003,  // Slightly above item
      inchesToUnits(item.posZ) + w / 2
    );
    group.add(topMesh);

    // --- FRONT FACE LABEL (facing +Z) ---
    // Visible when viewing from front
    if (h > 0.04 && l > 0.04) {  // Only if face is large enough
      const frontTexture = this.createTextTexture(
        primaryLine, secondaryLine, '', item.color, l, h, hazmatInfo
      );
      const frontGeom = new THREE.PlaneGeometry(l * 0.92, h * 0.92);
      const frontMat = new THREE.MeshBasicMaterial({
        map: frontTexture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const frontMesh = new THREE.Mesh(frontGeom, frontMat);
      frontMesh.position.set(
        inchesToUnits(item.posX) + l / 2,
        inchesToUnits(item.posY) + h / 2,
        inchesToUnits(item.posZ) + w + 0.003  // Slightly in front
      );
      group.add(frontMesh);
    }

    // --- SIDE FACE LABEL (facing +X) ---
    // Visible when viewing from side
    if (h > 0.04 && w > 0.04) {  // Only if face is large enough
      const sideTexture = this.createTextTexture(
        primaryLine, weightStr, '', item.color, w, h, hazmatInfo
      );
      const sideGeom = new THREE.PlaneGeometry(w * 0.92, h * 0.92);
      const sideMat = new THREE.MeshBasicMaterial({
        map: sideTexture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const sideMesh = new THREE.Mesh(sideGeom, sideMat);
      sideMesh.rotation.y = Math.PI / 2;  // Rotated to face side
      sideMesh.position.set(
        inchesToUnits(item.posX) + l + 0.003,  // Slightly to the side
        inchesToUnits(item.posY) + h / 2,
        inchesToUnits(item.posZ) + w / 2
      );
      group.add(sideMesh);
    }

    return group;
  }

  /**
   * Creates a canvas texture with formatted text lines on a styled background.
   * Canvas resolution scales with face size to maintain readability.
   *
   * When `hazmatInfo` is supplied the bottom of the canvas gets a large, bold
   * HAZMAT stripe showing "⚠ HAZMAT  CLASS X" in UN/DOT standard colours so
   * the marking is visible from any angle.
   *
   * Design features:
   * - Semi-transparent dark background with rounded corners
   * - Accent color bar at top matching item color
   * - Three text lines with hierarchical sizing
   * - Text clipping for long labels
   * - Optional HAZMAT stripe at bottom (when hazmatInfo provided)
   *
   * @param line1       - Primary text (item label) - largest, white
   * @param line2       - Secondary text (category, weight) - medium, light gray
   * @param line3       - Tertiary text (dimensions) - smallest, muted
   * @param accentColor - Color for accent bar (item color)
   * @param faceW       - Face width in Three.js units
   * @param faceH       - Face height in Three.js units
   * @param hazmatInfo  - Optional HAZMAT class metadata; when present draws the
   *                      HAZMAT stripe and omits the plain label shape
   * @returns Canvas texture ready for use on mesh
   */
  private createTextTexture(
    line1: string,
    line2: string,
    line3: string,
    accentColor: string,
    faceW: number,
    faceH: number,
    hazmatInfo?: { color: string; textColor: string; classNum: number; label: string } | null,
  ): THREE.CanvasTexture {
    // Calculate canvas resolution based on face size
    // Larger faces get higher resolution for better readability
    const baseRes = 512;
    const aspect = faceW / Math.max(faceH, 0.001);
    let canvasW: number, canvasH: number;
    if (aspect >= 1) {
      canvasW = baseRes;
      canvasH = Math.max(64, Math.round(baseRes / aspect));
    } else {
      canvasH = baseRes;
      canvasW = Math.max(64, Math.round(baseRes * aspect));
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;

    // Clear and draw rounded background
    ctx.clearRect(0, 0, canvasW, canvasH);
    const pad = Math.round(canvasW * 0.04);
    this.roundRect(ctx, pad, pad, canvasW - pad * 2, canvasH - pad * 2, Math.round(canvasW * 0.03));
    ctx.fillStyle = 'rgba(10, 14, 24, 0.55)';  // Semi-transparent dark
    ctx.fill();

    // ── HAZMAT stripe ──────────────────────────────────────────────────────────
    // Reserve the bottom 28 % of the canvas for the HAZMAT banner; normal text
    // is rendered in the remaining top portion.
    const hazmatBandH = hazmatInfo ? Math.round(canvasH * 0.28) : 0;

    // Draw accent color bar at top
    const barH = Math.max(3, Math.round(canvasH * 0.035));
    ctx.fillStyle = accentColor;
    ctx.fillRect(pad, pad, canvasW - pad * 2, barH);

    // Calculate text sizing based on available space
    // Reserve space for hazmat band when present
    const textAreaH = canvasH - hazmatBandH;
    const maxTextW = canvasW - pad * 4;

    // Dynamically size fonts based on canvas dimensions
    let fontSize1 = Math.round(Math.min(textAreaH * 0.22, canvasW * 0.12));
    let fontSize2 = Math.round(fontSize1 * 0.7);
    let fontSize3 = Math.round(fontSize1 * 0.6);

    // Ensure minimum readability and maximum size
    fontSize1 = Math.max(10, Math.min(fontSize1, 72));
    fontSize2 = Math.max(8, Math.min(fontSize2, 52));
    fontSize3 = Math.max(7, Math.min(fontSize3, 42));

    // Calculate vertical positioning for centered text (within text area)
    const totalTextH = fontSize1 + (line2 ? fontSize2 + 4 : 0) + (line3 ? fontSize3 + 4 : 0);
    let textY = (textAreaH - totalTextH) / 2 + fontSize1 * 0.35 + barH * 0.5;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // RENDER LINE 1: Primary label (white, bold)
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize1}px Inter, sans-serif`;
    const clipped1 = this.clipText(ctx, line1, maxTextW);
    ctx.fillText(clipped1, canvasW / 2, textY);
    textY += fontSize1 * 0.5;

    // RENDER LINE 2: Secondary info (lighter)
    if (line2) {
      textY += fontSize2 * 0.6;
      ctx.fillStyle = 'rgba(200, 215, 235, 0.85)';
      ctx.font = `500 ${fontSize2}px Inter, sans-serif`;
      const clipped2 = this.clipText(ctx, line2, maxTextW);
      ctx.fillText(clipped2, canvasW / 2, textY);
      textY += fontSize2 * 0.5;
    }

    // RENDER LINE 3: Tertiary info (muted, monospace)
    if (line3) {
      textY += fontSize3 * 0.6;
      ctx.fillStyle = 'rgba(160, 175, 195, 0.7)';
      ctx.font = `400 ${fontSize3}px JetBrains Mono, monospace`;
      const clipped3 = this.clipText(ctx, line3, maxTextW);
      ctx.fillText(clipped3, canvasW / 2, textY);
    }

    // ── HAZMAT bottom stripe ───────────────────────────────────────────────────
    if (hazmatInfo) {
      const bandY = canvasH - hazmatBandH;

      // Solid placard-colour background band
      ctx.fillStyle = hazmatInfo.color;
      ctx.fillRect(pad, bandY, canvasW - pad * 2, hazmatBandH - pad);

      // Contrasting top border on the band
      const bandBorderH = Math.max(2, Math.round(hazmatBandH * 0.06));
      ctx.fillStyle = hazmatInfo.textColor;
      ctx.fillRect(pad, bandY, canvasW - pad * 2, bandBorderH);

      // "HAZMAT" text — large and bold
      const hazFs = Math.round(Math.min(hazmatBandH * 0.42, canvasW * 0.18));
      ctx.fillStyle = hazmatInfo.textColor;
      ctx.font = `900 ${hazFs}px Inter, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const bandCy = bandY + hazmatBandH * 0.38;
      // When there is room, draw "HAZMAT" and "CLASS X" on separate lines
      ctx.fillText('HAZMAT', canvasW / 2, bandCy);

      if (hazmatInfo.classNum > 0) {
        const clsFs = Math.round(hazFs * 0.52);
        ctx.font = `700 ${clsFs}px Inter, Arial, sans-serif`;
        ctx.fillText(`CLASS  ${hazmatInfo.classNum}`, canvasW / 2, bandCy + hazFs * 0.65);
      }
    }

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Clips text to fit within a maximum width, adding ellipsis if needed.
   * 
   * @param ctx - Canvas rendering context (for text measurement)
   * @param text - Text to clip
   * @param maxW - Maximum width in pixels
   * @returns Clipped text with '...' if truncated, or original text if it fits
   */
  private clipText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
    if (ctx.measureText(text).width <= maxW) return text;
    
    let clipped = text;
    while (clipped.length > 1 && ctx.measureText(clipped + '...').width > maxW) {
      clipped = clipped.slice(0, -1);
    }
    return clipped + '...';
  }

  /**
   * Draws a rounded rectangle path on the canvas context.
   * Path is created but not filled/stroked - caller must apply fill/stroke.
   * 
   * @param ctx - Canvas rendering context
   * @param x - X coordinate of top-left corner
   * @param y - Y coordinate of top-left corner
   * @param w - Width of rectangle
   * @param h - Height of rectangle
   * @param r - Radius of corners
   */
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Converts category type to human-readable label.
   * 
   * @param cat - Category identifier
   * @returns Formatted category name
   */
  private getCategoryLabel(cat: string): string {
    const labels: Record<string, string> = {
      general: 'General',
      fragile: 'Fragile',
      heavy: 'Heavy',
      hazardous: 'Hazardous',
      perishable: 'Perishable',
    };
    return labels[cat] || 'General';
  }
}
