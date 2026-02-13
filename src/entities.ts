/**
 * 3D Entity Creation
 * 
 * This file contains all functions for creating Three.js meshes and 3D objects.
 * Handles the visual representation of:
 * - Shipping containers with walls, floors, and grids
 * - Cargo items with proper materials and lighting
 * - Selection highlights and interaction affordances
 * - Environment lighting setup
 */

import * as THREE from "three";
import {
  CargoItem,
  ContainerSpec,
  SCALE_FACTOR,
} from "./definitions";
import { inchesToUnits } from "./utils";

// ============================================================================
// CONTAINER VISUALIZATION
// ============================================================================

/**
 * Creates a complete 3D representation of a shipping container.
 * Includes transparent walls with edges, floor plane, corner posts, and floor grid.
 * The container is semi-transparent to allow viewing cargo inside.
 * 
 * @param spec - Container specifications (dimensions, capacity)
 * @param gridSize - Grid line spacing in inches for the floor grid
 * @returns THREE.Group containing all container mesh components
 * 
 * @example
 * const container = createContainerMesh(CONTAINER_SPECS['20ft'], 6);
 * scene.add(container);
 */
export function createContainerMesh(spec: ContainerSpec, gridSize: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'container';

  const l = inchesToUnits(spec.lengthIn);
  const w = inchesToUnits(spec.widthIn);
  const h = inchesToUnits(spec.heightIn);

  // Semi-transparent wall material for visibility into container
  const wallMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x5588cc,
    transparent: true,
    opacity: 0.05,
    side: THREE.DoubleSide,
    roughness: 0.5,
    metalness: 0.1,
    depthWrite: false,
  });

  // Container edge wireframe for clear boundaries
  const edgeGeometry = new THREE.BoxGeometry(l, h, w);
  const edgeMesh = new THREE.LineSegments(
    new THREE.EdgesGeometry(edgeGeometry),
    new THREE.LineBasicMaterial({ color: 0x5599dd, linewidth: 1.5, transparent: true, opacity: 0.7 })
  );
  edgeMesh.position.set(l / 2, h / 2, w / 2);
  group.add(edgeMesh);

  // Translucent walls for depth perception
  const wallGeom = new THREE.BoxGeometry(l, h, w);
  const wallMesh = new THREE.Mesh(wallGeom, wallMaterial);
  wallMesh.position.set(l / 2, h / 2, w / 2);
  group.add(wallMesh);

  // Container floor plane - slightly visible to show base
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x3a5070,
    transparent: true,
    opacity: 0.35,
    roughness: 0.8,
    metalness: 0.05,
  });
  const floorGeom = new THREE.PlaneGeometry(l, w);
  const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(l / 2, 0.001, w / 2);
  floorMesh.name = 'container-floor';
  group.add(floorMesh);

  // Add grid lines for measurement reference
  const gridGroup = createFloorGrid(spec, gridSize);
  group.add(gridGroup);

  // Corner posts for structural reference
  const postMat = new THREE.MeshBasicMaterial({ color: 0x5599dd, transparent: true, opacity: 0.5 });
  const postGeom = new THREE.CylinderGeometry(0.018, 0.018, h, 8);
  const corners = [
    [0, h / 2, 0],
    [l, h / 2, 0],
    [0, h / 2, w],
    [l, h / 2, w],
  ];
  for (const [px, py, pz] of corners) {
    const post = new THREE.Mesh(postGeom, postMat);
    post.position.set(px, py, pz);
    group.add(post);
  }

  return group;
}

/**
 * Creates a grid of lines on the container floor.
 * Provides visual reference for measurements and alignment.
 * Grid lines are spaced according to the specified grid size.
 * 
 * @param spec - Container specifications
 * @param gridSize - Spacing between grid lines in inches
 * @returns THREE.Group containing all grid line segments
 * 
 * @example
 * const grid = createFloorGrid(containerSpec, 6); // 6-inch grid
 */
export function createFloorGrid(spec: ContainerSpec, gridSize: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'floor-grid';

  const l = inchesToUnits(spec.lengthIn);
  const w = inchesToUnits(spec.widthIn);

  const gridMat = new THREE.LineBasicMaterial({ color: 0x3a5070, transparent: true, opacity: 0.35 });

  // Create grid lines along length (X axis)
  for (let x = 0; x <= spec.lengthIn; x += gridSize) {
    const ux = inchesToUnits(x);
    const points = [new THREE.Vector3(ux, 0.002, 0), new THREE.Vector3(ux, 0.002, w)];
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geom, gridMat));
  }

  // Create grid lines along width (Z axis)
  for (let z = 0; z <= spec.widthIn; z += gridSize) {
    const uz = inchesToUnits(z);
    const points = [new THREE.Vector3(0, 0.002, uz), new THREE.Vector3(l, 0.002, uz)];
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geom, gridMat));
  }

  return group;
}

// ============================================================================
// CARGO ITEM VISUALIZATION
// ============================================================================

/**
 * Creates the 3D mesh for a cargo item.
 * Includes:
 * - Solid box with physically-based material and color
 * - Edge wireframe for crisp definition
 * - Top plane indicator for stacking reference
 * - Rotation arrow (if item is rotated)
 * 
 * The mesh is created with proper shadows and translucency for depth perception.
 * 
 * @param item - Cargo item data including position, dimensions, color
 * @returns THREE.Group containing the complete item visualization
 * 
 * @example
 * const itemMesh = createItemMesh(cargoItem);
 * scene.add(itemMesh);
 */
export function createItemMesh(item: CargoItem): THREE.Group {
  const group = new THREE.Group();
  group.name = `item-${item.id}`;
  group.userData = { itemId: item.id };

  const l = inchesToUnits(item.lengthIn);
  const w = inchesToUnits(item.widthIn);
  const h = inchesToUnits(item.heightIn);

  const color = new THREE.Color(item.color);

  // Main cargo box with physically-based rendering
  const boxGeom = new THREE.BoxGeometry(l, h, w);
  const boxMat = new THREE.MeshPhysicalMaterial({
    color: color,
    transparent: true,
    opacity: 0.78,
    roughness: 0.35,
    metalness: 0.05,
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
  });
  const boxMesh = new THREE.Mesh(boxGeom, boxMat);
  boxMesh.position.set(l / 2, h / 2, w / 2);
  boxMesh.castShadow = true;
  boxMesh.receiveShadow = true;
  boxMesh.name = 'item-box';
  boxMesh.userData = { itemId: item.id };
  group.add(boxMesh);

  // Edge lines for clear definition
  const edgeGeom = new THREE.EdgesGeometry(boxGeom);
  const edgeMat = new THREE.LineBasicMaterial({
    color: color.clone().multiplyScalar(1.6),
    transparent: true,
    opacity: 0.85,
  });
  const edges = new THREE.LineSegments(edgeGeom, edgeMat);
  edges.position.copy(boxMesh.position);
  group.add(edges);

  // Top surface indicator for stacking visualization
  const topGeom = new THREE.PlaneGeometry(l * 0.92, w * 0.92);
  const topMat = new THREE.MeshBasicMaterial({
    color: color.clone().multiplyScalar(1.4),
    transparent: true,
    opacity: 0.12,
  });
  const topPlane = new THREE.Mesh(topGeom, topMat);
  topPlane.rotation.x = -Math.PI / 2;
  topPlane.position.set(l / 2, h + 0.001, w / 2);
  group.add(topPlane);

  // Add rotation arrow if item has been rotated
  if (item.rotationY > 0) {
    const arrowLen = Math.min(l, w) * 0.3;
    const arrowMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    const arrowPoints = [
      new THREE.Vector3(l / 2 - arrowLen / 2, h + 0.003, w / 2),
      new THREE.Vector3(l / 2 + arrowLen / 2, h + 0.003, w / 2),
      new THREE.Vector3(l / 2 + arrowLen / 4, h + 0.003, w / 2 - arrowLen / 4),
      new THREE.Vector3(l / 2 + arrowLen / 2, h + 0.003, w / 2),
      new THREE.Vector3(l / 2 + arrowLen / 4, h + 0.003, w / 2 + arrowLen / 4),
    ];
    const arrowGeom = new THREE.BufferGeometry().setFromPoints(arrowPoints);
    const arrowLine = new THREE.Line(arrowGeom, arrowMat);
    group.add(arrowLine);
  }

  // Position the group at the item's location in the container
  group.position.set(
    inchesToUnits(item.posX),
    inchesToUnits(item.posY),
    inchesToUnits(item.posZ)
  );

  group.visible = item.visible;

  return group;
}

/**
 * Creates a semi-transparent "ghost" preview of an item during drag operations.
 * Shows where the item will be placed before mouse release.
 * Color changes (green/red) based on placement validity.
 * 
 * @param item - Item to create ghost preview for
 * @returns THREE.Group containing the ghost preview mesh
 * 
 * @example
 * const ghost = createGhostMesh(draggedItem);
 * ghost.visible = true; // Show during drag
 * scene.add(ghost);
 */
export function createGhostMesh(item: CargoItem): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ghost-preview';

  const l = inchesToUnits(item.lengthIn);
  const w = inchesToUnits(item.widthIn);
  const h = inchesToUnits(item.heightIn);

  // Translucent box for preview
  const boxGeom = new THREE.BoxGeometry(l, h, w);
  const boxMat = new THREE.MeshBasicMaterial({
    color: 0x5b8af5,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  const box = new THREE.Mesh(boxGeom, boxMat);
  box.position.set(l / 2, h / 2, w / 2);
  group.add(box);

  // Edge outline for clarity
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x7ea8ff,
    transparent: true,
    opacity: 0.6,
  });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeom), edgeMat);
  edges.position.copy(box.position);
  group.add(edges);

  group.visible = false;
  return group;
}

/**
 * Creates a visual highlight effect around a selected item.
 * White wireframe outline with subtle glow effect.
 * Slightly larger than the actual item for clear indication.
 * 
 * @param item - The selected cargo item
 * @returns THREE.Group containing highlight meshes
 * 
 * @example
 * const highlight = createSelectionHighlight(selectedItem);
 * scene.add(highlight);
 */
export function createSelectionHighlight(item: CargoItem): THREE.Group {
  const group = new THREE.Group();
  group.name = 'selection-highlight';

  // Make highlight slightly larger than item
  const l = inchesToUnits(item.lengthIn) + 0.025;
  const w = inchesToUnits(item.widthIn) + 0.025;
  const h = inchesToUnits(item.heightIn) + 0.025;

  // Bright white edge outline
  const boxGeom = new THREE.BoxGeometry(l, h, w);
  const edgeGeom = new THREE.EdgesGeometry(boxGeom);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0.92 });
  const edges = new THREE.LineSegments(edgeGeom, edgeMat);
  edges.position.set(
    inchesToUnits(item.posX) + inchesToUnits(item.lengthIn) / 2,
    inchesToUnits(item.posY) + inchesToUnits(item.heightIn) / 2,
    inchesToUnits(item.posZ) + inchesToUnits(item.widthIn) / 2
  );

  group.add(edges);

  // Subtle glow box around selection
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x5b8af5,
    transparent: true,
    opacity: 0.1,
  });
  const glowMesh = new THREE.Mesh(new THREE.BoxGeometry(l + 0.01, h + 0.01, w + 0.01), glowMat);
  glowMesh.position.copy(edges.position);
  group.add(glowMesh);

  return group;
}

// ============================================================================
// INTERACTION HELPERS
// ============================================================================

/**
 * Creates an invisible plane for drag-and-drop operations.
 * Used for raycasting to determine where user is dragging an item.
 * Positioned at a specific Y level (height) to constrain dragging.
 * 
 * @param container - Container specifications for plane sizing
 * @param yLevel - Height in inches at which to position the plane
 * @returns THREE.Mesh of invisible plane for raycasting
 * 
 * @example
 * const dragPlane = createStackingPlane(container, 24); // At 24" height
 * scene.add(dragPlane);
 */
export function createStackingPlane(container: ContainerSpec, yLevel: number): THREE.Mesh {
  const l = inchesToUnits(container.lengthIn);
  const w = inchesToUnits(container.widthIn);
  
  // Plane is oversized to catch all drag movements
  const planeGeom = new THREE.PlaneGeometry(l * 3, w * 3);
  const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(planeGeom, planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(l / 2, inchesToUnits(yLevel), w / 2);
  plane.name = 'drag-plane';
  return plane;
}

// ============================================================================
// SCENE ENVIRONMENT
// ============================================================================

/**
 * Creates a large ground plane beneath the container.
 * Provides a visual foundation and receives shadows.
 * Color matches the dark theme background.
 * 
 * @returns THREE.Mesh of the ground plane
 * 
 * @example
 * const ground = createGroundPlane();
 * scene.add(ground);
 */
export function createGroundPlane(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(50, 50);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x0f1219,
    roughness: 0.9,
    metalness: 0.05,
  });
  const plane = new THREE.Mesh(geometry, material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.001;
  plane.receiveShadow = true;
  plane.name = 'ground';
  return plane;
}

/**
 * Creates the complete lighting setup for the scene.
 * Includes:
 * - Ambient light for base illumination
 * - Main directional light with shadows (key light)
 * - Fill light to soften shadows
 * - Rim light for edge definition
 * - Point light for localized highlights
 * 
 * This creates a professional 3-point lighting setup with shadows.
 * 
 * @returns THREE.Group containing all light sources
 * 
 * @example
 * const lights = createEnvironment();
 * scene.add(lights);
 */
export function createEnvironment(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'environment';

  // Ambient light for base scene illumination
  const ambientLight = new THREE.AmbientLight(0x556688, 1.0);
  group.add(ambientLight);

  // Main directional light with shadow casting (key light)
  const dirLight = new THREE.DirectionalLight(0xffeedd, 1.4);
  dirLight.position.set(8, 12, 6);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.1;
  dirLight.shadow.camera.far = 50;
  dirLight.shadow.camera.left = -15;
  dirLight.shadow.camera.right = 15;
  dirLight.shadow.camera.top = 15;
  dirLight.shadow.camera.bottom = -15;
  dirLight.shadow.bias = -0.001;
  group.add(dirLight);

  // Fill light to soften shadows (blue-tinted)
  const fillLight = new THREE.DirectionalLight(0x7799cc, 0.6);
  fillLight.position.set(-5, 6, -3);
  group.add(fillLight);

  // Rim light for edge definition (warm-tinted)
  const rimLight = new THREE.DirectionalLight(0xcc9977, 0.35);
  rimLight.position.set(0, 2, -8);
  group.add(rimLight);

  // Point light for localized highlights
  const pointLight = new THREE.PointLight(0x5588cc, 0.5, 20);
  pointLight.position.set(2, 3, 1);
  group.add(pointLight);

  return group;
}
