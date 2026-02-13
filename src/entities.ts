
import * as THREE from "three";
import {
  CargoItem,
  ContainerSpec,
  SCALE_FACTOR,
} from "./definitions";
import { inchesToUnits } from "./utils";

export function createContainerMesh(spec: ContainerSpec, gridSize: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'container';

  const l = inchesToUnits(spec.lengthIn);
  const w = inchesToUnits(spec.widthIn);
  const h = inchesToUnits(spec.heightIn);

  const wallMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x5588cc,
    transparent: true,
    opacity: 0.05,
    side: THREE.DoubleSide,
    roughness: 0.5,
    metalness: 0.1,
    depthWrite: false,
  });

  const edgeGeometry = new THREE.BoxGeometry(l, h, w);
  const edgeMesh = new THREE.LineSegments(
    new THREE.EdgesGeometry(edgeGeometry),
    new THREE.LineBasicMaterial({ color: 0x5599dd, linewidth: 1.5, transparent: true, opacity: 0.7 })
  );
  edgeMesh.position.set(l / 2, h / 2, w / 2);
  group.add(edgeMesh);

  const wallGeom = new THREE.BoxGeometry(l, h, w);
  const wallMesh = new THREE.Mesh(wallGeom, wallMaterial);
  wallMesh.position.set(l / 2, h / 2, w / 2);
  group.add(wallMesh);

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

  const gridGroup = createFloorGrid(spec, gridSize);
  group.add(gridGroup);

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

export function createFloorGrid(spec: ContainerSpec, gridSize: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'floor-grid';

  const l = inchesToUnits(spec.lengthIn);
  const w = inchesToUnits(spec.widthIn);

  const gridMat = new THREE.LineBasicMaterial({ color: 0x3a5070, transparent: true, opacity: 0.35 });

  for (let x = 0; x <= spec.lengthIn; x += gridSize) {
    const ux = inchesToUnits(x);
    const points = [new THREE.Vector3(ux, 0.002, 0), new THREE.Vector3(ux, 0.002, w)];
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geom, gridMat));
  }

  for (let z = 0; z <= spec.widthIn; z += gridSize) {
    const uz = inchesToUnits(z);
    const points = [new THREE.Vector3(0, 0.002, uz), new THREE.Vector3(l, 0.002, uz)];
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geom, gridMat));
  }

  return group;
}

export function createItemMesh(item: CargoItem): THREE.Group {
  const group = new THREE.Group();
  group.name = `item-${item.id}`;
  group.userData = { itemId: item.id };

  const l = inchesToUnits(item.lengthIn);
  const w = inchesToUnits(item.widthIn);
  const h = inchesToUnits(item.heightIn);

  const color = new THREE.Color(item.color);

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

  const edgeGeom = new THREE.EdgesGeometry(boxGeom);
  const edgeMat = new THREE.LineBasicMaterial({
    color: color.clone().multiplyScalar(1.6),
    transparent: true,
    opacity: 0.85,
  });
  const edges = new THREE.LineSegments(edgeGeom, edgeMat);
  edges.position.copy(boxMesh.position);
  group.add(edges);

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

  group.position.set(
    inchesToUnits(item.posX),
    inchesToUnits(item.posY),
    inchesToUnits(item.posZ)
  );

  group.visible = item.visible;

  return group;
}

export function createGhostMesh(item: CargoItem): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ghost-preview';

  const l = inchesToUnits(item.lengthIn);
  const w = inchesToUnits(item.widthIn);
  const h = inchesToUnits(item.heightIn);

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

export function createSelectionHighlight(item: CargoItem): THREE.Group {
  const group = new THREE.Group();
  group.name = 'selection-highlight';

  const l = inchesToUnits(item.lengthIn) + 0.025;
  const w = inchesToUnits(item.widthIn) + 0.025;
  const h = inchesToUnits(item.heightIn) + 0.025;

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

export function createStackingPlane(container: ContainerSpec, yLevel: number): THREE.Mesh {
  const l = inchesToUnits(container.lengthIn);
  const w = inchesToUnits(container.widthIn);
  const planeGeom = new THREE.PlaneGeometry(l * 3, w * 3);
  const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(planeGeom, planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(l / 2, inchesToUnits(yLevel), w / 2);
  plane.name = 'drag-plane';
  return plane;
}

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

export function createEnvironment(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'environment';

  const ambientLight = new THREE.AmbientLight(0x556688, 1.0);
  group.add(ambientLight);

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

  const fillLight = new THREE.DirectionalLight(0x7799cc, 0.6);
  fillLight.position.set(-5, 6, -3);
  group.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xcc9977, 0.35);
  rimLight.position.set(0, 2, -8);
  group.add(rimLight);

  const pointLight = new THREE.PointLight(0x5588cc, 0.5, 20);
  pointLight.position.set(2, 3, 1);
  group.add(pointLight);

  return group;
}
