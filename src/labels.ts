
import * as THREE from "three";
import { CargoItem } from "./definitions";
import { inchesToUnits } from "./utils";

/**
 * Manages text labels rendered directly on item box faces as canvas textures.
 * Labels are "wrapped" onto the top and front faces of each cargo box.
 */
export class ItemLabelManager {
  private labelMeshes: Map<string, THREE.Group> = new Map();
  private parentScene: THREE.Scene | null = null;
  private visible: boolean = true;

  constructor(_container: HTMLElement) {
    // container element no longer needed; labels are 3D objects
  }

  setScene(scene: THREE.Scene): void {
    this.parentScene = scene;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const group of this.labelMeshes.values()) {
      group.visible = v;
    }
  }

  toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  createLabel(item: CargoItem): void {
    this.removeLabel(item.id);
    if (!this.parentScene) return;

    const group = this.buildLabelGroup(item);
    group.visible = this.visible && item.visible;
    this.parentScene.add(group);
    this.labelMeshes.set(item.id, group);
  }

  removeLabel(id: string): void {
    const group = this.labelMeshes.get(id);
    if (group) {
      if (this.parentScene) this.parentScene.remove(group);
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

  removeAll(): void {
    for (const id of Array.from(this.labelMeshes.keys())) {
      this.removeLabel(id);
    }
  }

  updateLabel(item: CargoItem): void {
    this.removeLabel(item.id);
    this.createLabel(item);
  }

  /**
   * No-op: labels are 3D objects and update automatically with the camera.
   */
  updatePositions(
    _items: CargoItem[],
    _camera: THREE.Camera,
    _containerRect: DOMRect
  ): void {
    // Nothing needed - labels are in 3D space
  }

  /**
   * Update visibility of a specific label to match item visibility.
   */
  syncVisibility(item: CargoItem): void {
    const group = this.labelMeshes.get(item.id);
    if (group) {
      group.visible = this.visible && item.visible;
    }
  }

  private buildLabelGroup(item: CargoItem): THREE.Group {
    const group = new THREE.Group();
    group.name = `label-${item.id}`;

    const l = inchesToUnits(item.lengthIn);
    const w = inchesToUnits(item.widthIn);
    const h = inchesToUnits(item.heightIn);

    const catLabel = this.getCategoryLabel(item.category);
    const weightStr = item.weightLbs >= 1000
      ? (item.weightLbs / 1000).toFixed(1) + 'k lbs'
      : item.weightLbs + ' lbs';
    const dimsStr = `${item.lengthIn} x ${item.widthIn} x ${item.heightIn}"`;

    const primaryLine = item.label;
    const secondaryLine = `${catLabel} | ${weightStr}`;
    const tertiaryLine = dimsStr;

    // --- TOP FACE label ---
    const topTexture = this.createTextTexture(
      primaryLine, secondaryLine, tertiaryLine, item.color, l, w
    );
    const topGeom = new THREE.PlaneGeometry(l * 0.92, w * 0.92);
    const topMat = new THREE.MeshBasicMaterial({
      map: topTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const topMesh = new THREE.Mesh(topGeom, topMat);
    topMesh.rotation.x = -Math.PI / 2;
    topMesh.position.set(
      inchesToUnits(item.posX) + l / 2,
      inchesToUnits(item.posY) + h + 0.003,
      inchesToUnits(item.posZ) + w / 2
    );
    group.add(topMesh);

    // --- FRONT FACE label (facing +Z) ---
    if (h > 0.04 && l > 0.04) {
      const frontTexture = this.createTextTexture(
        primaryLine, secondaryLine, '', item.color, l, h
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
        inchesToUnits(item.posZ) + w + 0.003
      );
      group.add(frontMesh);
    }

    // --- SIDE FACE label (facing +X) ---
    if (h > 0.04 && w > 0.04) {
      const sideTexture = this.createTextTexture(
        primaryLine, weightStr, '', item.color, w, h
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
      sideMesh.rotation.y = Math.PI / 2;
      sideMesh.position.set(
        inchesToUnits(item.posX) + l + 0.003,
        inchesToUnits(item.posY) + h / 2,
        inchesToUnits(item.posZ) + w / 2
      );
      group.add(sideMesh);
    }

    return group;
  }

  /**
   * Creates a canvas texture with text lines rendered on a semi-transparent background.
   * faceW and faceH are in Three.js units (scaled).
   */
  private createTextTexture(
    line1: string,
    line2: string,
    line3: string,
    accentColor: string,
    faceW: number,
    faceH: number
  ): THREE.CanvasTexture {
    // Canvas resolution scales with face size for readability
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

    // Semi-transparent dark background with rounded rect
    ctx.clearRect(0, 0, canvasW, canvasH);
    const pad = Math.round(canvasW * 0.04);
    this.roundRect(ctx, pad, pad, canvasW - pad * 2, canvasH - pad * 2, Math.round(canvasW * 0.03));
    ctx.fillStyle = 'rgba(10, 14, 24, 0.55)';
    ctx.fill();

    // Accent color bar at top
    const barH = Math.max(3, Math.round(canvasH * 0.035));
    ctx.fillStyle = accentColor;
    ctx.fillRect(pad, pad, canvasW - pad * 2, barH);

    // Text sizing
    const maxTextW = canvasW - pad * 4;
    const lineCount = [line1, line2, line3].filter(Boolean).length;
    
    // Dynamically size font based on available space
    let fontSize1 = Math.round(Math.min(canvasH * 0.22, canvasW * 0.12));
    let fontSize2 = Math.round(fontSize1 * 0.7);
    let fontSize3 = Math.round(fontSize1 * 0.6);

    // Ensure minimum readability
    fontSize1 = Math.max(10, Math.min(fontSize1, 72));
    fontSize2 = Math.max(8, Math.min(fontSize2, 52));
    fontSize3 = Math.max(7, Math.min(fontSize3, 42));

    const totalTextH = fontSize1 + (line2 ? fontSize2 + 4 : 0) + (line3 ? fontSize3 + 4 : 0);
    let textY = (canvasH - totalTextH) / 2 + fontSize1 * 0.35 + barH * 0.5;

    // Line 1: primary name (white, bold)
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize1}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const clipped1 = this.clipText(ctx, line1, maxTextW);
    ctx.fillText(clipped1, canvasW / 2, textY);
    textY += fontSize1 * 0.5;

    // Line 2: secondary info (lighter)
    if (line2) {
      textY += fontSize2 * 0.6;
      ctx.fillStyle = 'rgba(200, 215, 235, 0.85)';
      ctx.font = `500 ${fontSize2}px Inter, sans-serif`;
      const clipped2 = this.clipText(ctx, line2, maxTextW);
      ctx.fillText(clipped2, canvasW / 2, textY);
      textY += fontSize2 * 0.5;
    }

    // Line 3: tertiary info (muted)
    if (line3) {
      textY += fontSize3 * 0.6;
      ctx.fillStyle = 'rgba(160, 175, 195, 0.7)';
      ctx.font = `400 ${fontSize3}px JetBrains Mono, monospace`;
      const clipped3 = this.clipText(ctx, line3, maxTextW);
      ctx.fillText(clipped3, canvasW / 2, textY);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  private clipText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
    if (ctx.measureText(text).width <= maxW) return text;
    let clipped = text;
    while (clipped.length > 1 && ctx.measureText(clipped + '...').width > maxW) {
      clipped = clipped.slice(0, -1);
    }
    return clipped + '...';
  }

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
