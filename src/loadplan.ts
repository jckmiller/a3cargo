
/**
 * Load Plan Generation
 * 
 * Generates step-by-step loading instructions for container loading operations.
 * Creates both interactive in-app views and printable PDF-ready documents.
 * 
 * Features:
 * - Smart sorting algorithm (heavy first, bottom to top, front to back)
 * - Contextual loading instructions based on position and stacking
 * - Category-specific safety tips (fragile, hazardous, etc.)
 * - Visual snapshots for each step
 * - Cumulative weight and utilization tracking
 * - Weight distribution warnings
 */

import {
  CargoItem,
  ContainerSpec,
  CATEGORY_COLORS,
} from "./definitions";
import {
  calculateUtilization,
  calculateTotalWeight,
  getWeightDistribution,
  formatDimensions,
  getRotationLabel,
} from "./utils";

// ============================================================================
// LOAD PLAN DATA STRUCTURES
// ============================================================================

/**
 * Represents a single step in the loading sequence.
 * Each step includes the item to load, instructions, and cumulative metrics.
 */
export interface LoadStep {
  /** Step number in the sequence (1-based) */
  stepNumber: number;
  
  /** Cargo item to load in this step */
  item: CargoItem;
  
  /** Human-readable loading instruction with position details */
  instruction: string;
  
  /** Array of safety tips and handling notes */
  tips: string[];
  
  /** Total weight of all items loaded up to and including this step */
  cumulativeWeight: number;
  
  /** Percentage of container volume used up to this step */
  cumulativeUtilization: number;
  
  /** Optional 3D scene snapshot showing the item in place */
  snapshotDataUrl?: string;
}

// ============================================================================
// LOAD PLAN GENERATION
// ============================================================================

/**
 * Generates an optimized step-by-step loading plan from current item placement.
 * 
 * **Loading Priority Algorithm:**
 * 1. Lower Y position first (bottom to top)
 * 2. Heavier items first (for stability)
 * 3. Front to back (lower X first)
 * 4. Left to right (lower Z first)
 * 
 * This ensures:
 * - Heavy items on bottom for stability
 * - Proper stacking order (bottom-up)
 * - Logical loading sequence for workers
 * - Weight distribution awareness
 * 
 * @param items - Array of cargo items in the container
 * @param container - Container specifications
 * @returns Array of LoadStep objects in optimal loading order
 * 
 * @example
 * const plan = generateLoadPlan(items, container);
 * plan.forEach(step => {
 *   console.log(`Step ${step.stepNumber}: ${step.instruction}`);
 * });
 */
export function generateLoadPlan(
  items: CargoItem[],
  container: ContainerSpec
): LoadStep[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    const yDiff = a.posY - b.posY;
    if (Math.abs(yDiff) > 1) return yDiff;

    const wDiff = b.weightLbs - a.weightLbs;
    if (Math.abs(wDiff) > 10) return wDiff;

    const xDiff = a.posX - b.posX;
    if (Math.abs(xDiff) > 1) return xDiff;

    return a.posZ - b.posZ;
  });

  const steps: LoadStep[] = [];
  let cumulativeWeight = 0;
  const containerVolume = container.lengthIn * container.widthIn * container.heightIn;
  let cumulativeVolume = 0;

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    cumulativeWeight += item.weightLbs;
    cumulativeVolume += item.lengthIn * item.widthIn * item.heightIn;

    const instruction = buildInstruction(item, sorted, i, container);
    const tips = buildTips(item, sorted, i, container, cumulativeWeight);

    steps.push({
      stepNumber: i + 1,
      item,
      instruction,
      tips,
      cumulativeWeight,
      cumulativeUtilization: (cumulativeVolume / containerVolume) * 100,
    });
  }

  return steps;
}

// ============================================================================
// INSTRUCTION BUILDING HELPERS
// ============================================================================

/**
 * Builds a human-readable loading instruction for a specific item.
 * Determines whether item goes on floor or is stacked, and provides position context.
 * 
 * @param item - Item to create instruction for
 * @param allSorted - All items in loading order
 * @param index - Index of this item in the sorted array
 * @param container - Container specifications
 * @returns Formatted instruction string
 */
function buildInstruction(
  item: CargoItem,
  allSorted: CargoItem[],
  index: number,
  container: ContainerSpec
): string {
  const posDesc = getPositionDescription(item, container);
  const orientation = getOrientationDesc(item);

  if (item.posY < 1) {
    return `Place "${item.label}" on the container floor, ${posDesc}. ${orientation}`;
  } else {
    const below = allSorted.slice(0, index).filter(other => {
      return Math.abs(other.posY + other.heightIn - item.posY) < 2 &&
        item.posX < other.posX + other.lengthIn &&
        item.posX + item.lengthIn > other.posX &&
        item.posZ < other.posZ + other.widthIn &&
        item.posZ + item.widthIn > other.posZ;
    });

    if (below.length > 0) {
      const names = below.map(b => `"${b.label}"`).join(', ');
      return `Stack "${item.label}" on top of ${names}, ${posDesc}. ${orientation}`;
    } else {
      return `Place "${item.label}" at height ${item.posY.toFixed(0)}", ${posDesc}. ${orientation}`;
    }
  }
}

function getPositionDescription(item: CargoItem, container: ContainerSpec): string {
  const midX = container.lengthIn / 2;
  const midZ = container.widthIn / 2;
  const cx = item.posX + item.lengthIn / 2;
  const cz = item.posZ + item.widthIn / 2;

  const fb = cx < midX * 0.5 ? 'near the front' :
             cx < midX ? 'front-center' :
             cx < midX * 1.5 ? 'back-center' :
             'near the back';

  const lr = cz < midZ * 0.5 ? 'against the left wall' :
             cz < midZ ? 'left of center' :
             cz < midZ * 1.5 ? 'right of center' :
             'against the right wall';

  return `${fb}, ${lr}`;
}

/**
 * Describes the orientation of an item including rotation state.
 * 
 * @param item - Cargo item
 * @returns Orientation description with dimensions and rotation
 */
function getOrientationDesc(item: CargoItem): string {
  const rot = getRotationLabel(item);
  if (!rot) return `Orientation: ${item.lengthIn}"L x ${item.widthIn}"W x ${item.heightIn}"H (standard).`;
  return `Orientation: ${item.lengthIn}"L x ${item.widthIn}"W x ${item.heightIn}"H (rotated ${rot}).`;
}

/**
 * Generates contextual safety tips and handling notes for a loading step.
 * Tips include:
 * - Category-specific handling requirements
 * - Weight limit warnings
 * - Stacking stability notes
 * - Team size recommendations
 * - Fragile item warnings
 * 
 * @param item - Item being loaded
 * @param allSorted - All items in loading order
 * @param index - Current step index
 * @param container - Container specifications
 * @param cumulativeWeight - Total weight loaded so far
 * @returns Array of tip strings
 */
function buildTips(
  item: CargoItem,
  allSorted: CargoItem[],
  index: number,
  container: ContainerSpec,
  cumulativeWeight: number
): string[] {
  const tips: string[] = [];

  if (item.category === 'fragile') {
    tips.push('FRAGILE -- Handle with care. Avoid placing heavy items on top.');
  }
  if (item.category === 'hazardous') {
    tips.push('HAZARDOUS -- Follow IMDG/DOT regulations. Keep separation distances.');
  }
  if (item.category === 'perishable') {
    tips.push('PERISHABLE -- Ensure cold chain maintained. Load last if possible.');
  }
  if (item.category === 'heavy') {
    tips.push('HEAVY -- Use forklift or mechanical lift. Ensure floor-level placement.');
  }

  if (cumulativeWeight > container.maxWeightLbs * 0.9) {
    tips.push(`Container approaching weight limit (${cumulativeWeight.toLocaleString()} / ${container.maxWeightLbs.toLocaleString()} lbs)`);
  }

  if (item.posY > 0) {
    tips.push('Ensure item sits flat and stable on supporting items below.');
  }

  const volRatio = (item.lengthIn * item.widthIn * item.heightIn) / 
                   (container.lengthIn * container.widthIn * container.heightIn);
  if (volRatio > 0.08) {
    tips.push('Large item -- may need two people or forklift to position.');
  }

  const above = allSorted.slice(index + 1).filter(other => {
    return other.category === 'fragile' &&
      Math.abs(item.posY + item.heightIn - other.posY) < 2;
  });
  if (above.length > 0 && item.category !== 'fragile') {
    tips.push('Fragile item(s) will be placed on top -- ensure surface is flat.');
  }

  return tips;
}

/**
 * Helper to get a plain-text category label for print output.
 */
function getCategoryText(cat: string): string {
  const labels: Record<string, string> = {
    general: 'General',
    fragile: 'Fragile',
    heavy: 'Heavy',
    hazardous: 'Hazardous',
    perishable: 'Perishable',
  };
  return labels[cat] || 'General';
}

/**
 * Generate the HTML for the load plan modal (in-app view).
 * Uses standard ASCII characters only for tips/labels.
 */
export function generateLoadPlanHTML(
  steps: LoadStep[],
  container: ContainerSpec,
  items: CargoItem[]
): string {
  if (steps.length === 0) {
    return `
      <div class="empty-state" style="padding:40px 20px">
        <div class="icon" style="font-size:38px;opacity:0.4">--</div>
        <h4>No items to plan</h4>
        <p>Add items to the container first, then generate a load plan.</p>
      </div>
    `;
  }

  const totalWeight = calculateTotalWeight(items);
  const utilization = calculateUtilization(items, container);
  const dist = getWeightDistribution(items, container);

  let html = `
    <div class="loadplan-summary">
      <div class="loadplan-stat">
        <div class="lp-stat-value">${steps.length}</div>
        <div class="lp-stat-label">Loading Steps</div>
      </div>
      <div class="loadplan-stat">
        <div class="lp-stat-value">${utilization.toFixed(1)}%</div>
        <div class="lp-stat-label">Volume Used</div>
      </div>
      <div class="loadplan-stat">
        <div class="lp-stat-value">${totalWeight.toLocaleString()}</div>
        <div class="lp-stat-label">Total Weight (lbs)</div>
      </div>
      <div class="loadplan-stat">
        <div class="lp-stat-value ${Math.abs(dist.front - dist.back) > 20 ? 'lp-warn' : 'lp-ok'}">${dist.front.toFixed(0)}/${dist.back.toFixed(0)}</div>
        <div class="lp-stat-label">Front/Back %</div>
      </div>
    </div>

    <div class="loadplan-overview">
      <h3>Loading Strategy</h3>
      <div class="loadplan-strategy">
        ${getLoadingStrategy(items, container)}
      </div>
    </div>

    <div class="loadplan-progress-bar">
      <div class="loadplan-progress-track">
        ${steps.map((step, i) => `
          <div class="loadplan-progress-dot ${step.item.category}" 
               style="left:${((i + 1) / steps.length) * 100}%" 
               title="Step ${step.stepNumber}: ${step.item.label}">
            <span>${step.stepNumber}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="loadplan-steps" id="loadplan-steps">
  `;

  for (const step of steps) {
    const catColor = CATEGORY_COLORS[step.item.category] || '#5b8af5';
    const rotLabel = getRotationLabel(step.item);

    html += `
      <div class="loadplan-step" data-step="${step.stepNumber}">
        <div class="step-header">
          <div class="step-number" style="background:${catColor}">${step.stepNumber}</div>
          <div class="step-title">
            <div class="step-item-name">
              <span class="item-color" style="background:${step.item.color}"></span>
              ${step.item.label}
              <span class="category-badge ${step.item.category}">${step.item.category}</span>
              ${rotLabel ? `<span class="rotation-badge">${rotLabel}</span>` : ''}
            </div>
            <div class="step-item-specs">
              ${formatDimensions(step.item.lengthIn, step.item.widthIn, step.item.heightIn)} |
              ${step.item.weightLbs.toLocaleString()} lbs |
              Vol: ${((step.item.lengthIn * step.item.widthIn * step.item.heightIn) / 1728).toFixed(1)} ft3
            </div>
          </div>
          <div class="step-snapshot-wrap">
            ${step.snapshotDataUrl ? 
              `<img class="step-snapshot" src="${step.snapshotDataUrl}" alt="Step ${step.stepNumber}" />` :
              `<div class="step-snapshot-placeholder" data-step-idx="${step.stepNumber - 1}">
                <span>--</span>
                <small>Loading...</small>
              </div>`
            }
          </div>
        </div>

        <div class="step-instruction">
          <div class="instruction-icon" style="font-size:14px;font-weight:700;color:var(--accent-blue)">#${step.stepNumber}</div>
          <div class="instruction-text">${step.instruction}</div>
        </div>

        <div class="step-position-grid">
          <div class="pos-cell">
            <span class="pos-label">X Position</span>
            <span class="pos-value">${step.item.posX.toFixed(0)}"</span>
          </div>
          <div class="pos-cell">
            <span class="pos-label">Y Height</span>
            <span class="pos-value">${step.item.posY.toFixed(0)}"</span>
          </div>
          <div class="pos-cell">
            <span class="pos-label">Z Position</span>
            <span class="pos-value">${step.item.posZ.toFixed(0)}"</span>
          </div>
          <div class="pos-cell">
            <span class="pos-label">Cumul. Wt</span>
            <span class="pos-value">${step.cumulativeWeight.toLocaleString()} lbs</span>
          </div>
        </div>

        ${step.tips.length > 0 ? `
          <div class="step-tips">
            ${step.tips.map(tip => `<div class="step-tip">${tip}</div>`).join('')}
          </div>
        ` : ''}

        <div class="step-progress">
          <div class="step-progress-label">Loading progress: ${step.cumulativeUtilization.toFixed(1)}% volume</div>
          <div class="step-progress-bar">
            <div class="step-progress-fill" style="width:${Math.min(step.cumulativeUtilization, 100)}%"></div>
          </div>
        </div>
      </div>
    `;
  }

  html += `</div>`;

  return html;
}

function getLoadingStrategy(items: CargoItem[], container: ContainerSpec): string {
  const heavyItems = items.filter(i => i.category === 'heavy' || i.weightLbs > 500);
  const fragileItems = items.filter(i => i.category === 'fragile');
  const hazItems = items.filter(i => i.category === 'hazardous');
  const perishItems = items.filter(i => i.category === 'perishable');
  const stackedItems = items.filter(i => i.posY > 1);
  const floorItems = items.filter(i => i.posY <= 1);

  const points: string[] = [];

  points.push(`<strong>${floorItems.length}</strong> items on the floor level, <strong>${stackedItems.length}</strong> stacked above.`);

  if (heavyItems.length > 0) {
    points.push(`<strong>${heavyItems.length}</strong> heavy item(s) -- load these first to establish a stable base.`);
  }

  if (fragileItems.length > 0) {
    points.push(`<strong>${fragileItems.length}</strong> fragile item(s) -- place on top or protected areas. Avoid stacking heavy items above.`);
  }

  if (hazItems.length > 0) {
    points.push(`<strong>${hazItems.length}</strong> hazardous item(s) -- follow IMDG/DOT separation requirements.`);
  }

  if (perishItems.length > 0) {
    points.push(`<strong>${perishItems.length}</strong> perishable item(s) -- load last for first-out access. Maintain cold chain.`);
  }

  const dist = getWeightDistribution(items, container);
  if (Math.abs(dist.front - dist.back) > 20) {
    points.push(`WARNING: Weight is unevenly distributed front/back (${dist.front.toFixed(0)}%/${dist.back.toFixed(0)}%). Consider redistributing.`);
  } else {
    points.push(`OK: Weight distribution is balanced (Front: ${dist.front.toFixed(0)}%, Back: ${dist.back.toFixed(0)}%).`);
  }

  return `<ul>${points.map(p => `<li>${p}</li>`).join('')}</ul>`;
}

/**
 * Generate printable load plan HTML -- uses only standard ASCII characters, no emojis.
 * Images use light-mode scene snapshots.
 */
export function generatePrintableLoadPlan(
  steps: LoadStep[],
  container: ContainerSpec,
  items: CargoItem[]
): string {
  const totalWeight = calculateTotalWeight(items);
  const utilization = calculateUtilization(items, container);
  const dist = getWeightDistribution(items, container);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>A3 Shipping Pro - Step-by-Step Load Plan</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap");
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; color: #1a202c; padding: 28px; font-size: 12px; line-height: 1.5; background: white; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 3px solid #e84545; padding-bottom: 14px; }
    .header h1 { font-size: 20px; font-weight: 800; color: #e84545; }
    .header .subtitle { font-size: 11px; color: #666; }
    .header .date { font-size: 10px; color: #999; text-align: right; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .summary-card { border: 1px solid #ddd; border-radius: 6px; padding: 10px; text-align: center; }
    .summary-card .value { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; color: #e84545; }
    .summary-card .label { font-size: 8px; color: #888; text-transform: uppercase; letter-spacing: 0.7px; font-weight: 600; }
    .step { border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px; margin-bottom: 12px; page-break-inside: avoid; }
    .step-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
    .step-num { width: 32px; height: 32px; border-radius: 50%; background: #e84545; color: white; font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .step-info { flex: 1; }
    .step-name { font-size: 14px; font-weight: 700; color: #333; margin-bottom: 2px; }
    .step-specs { font-size: 10px; color: #888; font-family: 'JetBrains Mono', monospace; }
    .step-img { width: 200px; height: 120px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; flex-shrink: 0; }
    .step-img img { width: 100%; height: 100%; object-fit: cover; }
    .instruction { background: #f7f9fb; border-radius: 6px; padding: 10px; margin-bottom: 8px; font-size: 11px; line-height: 1.6; color: #333; border-left: 3px solid #e84545; }
    .pos-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
    .pos-cell { background: #f5f5f5; border-radius: 4px; padding: 5px 8px; text-align: center; }
    .pos-cell .plabel { font-size: 8px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; }
    .pos-cell .pvalue { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; color: #333; }
    .tip { font-size: 10px; color: #666; padding: 3px 0; border-bottom: 1px dotted #eee; }
    .tip:last-child { border-bottom: none; }
    .cat { display: inline-block; padding: 1px 5px; border-radius: 6px; font-size: 8px; font-weight: 600; text-transform: uppercase; }
    .cat.general { background: #e8f0fe; color: #4a7ae8; }
    .cat.fragile { background: #fee; color: #e05252; }
    .cat.heavy { background: #fef3cd; color: #d99e0b; }
    .cat.hazardous { background: #ffedd5; color: #e07a2f; }
    .cat.perishable { background: #d1fae5; color: #22b07a; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 9px; color: #999; text-align: center; }
    .strategy { background: #f7f9fb; border: 1px solid #e8e8e8; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; }
    .strategy h3 { font-size: 13px; margin-bottom: 8px; color: #333; }
    .strategy ul { list-style: none; padding: 0; }
    .strategy li { font-size: 11px; color: #444; padding: 3px 0; border-bottom: 1px solid #f0f0f0; line-height: 1.6; }
    .strategy li:last-child { border-bottom: none; }
    .progress-bar { width: 100%; height: 5px; background: #eee; border-radius: 3px; overflow: hidden; margin-top: 6px; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #4a7ae8, #0ea5c0); border-radius: 3px; }
    @media print { body { padding: 14px; } .step { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>A3 Shipping Pro</h1>
      <div class="subtitle">Step-by-Step Load Plan</div>
    </div>
    <div class="date">
      Container: <strong>${container.label}</strong><br>
      ${container.lengthIn}" x ${container.widthIn}" x ${container.heightIn}"<br>
      ${new Date().toLocaleString()}
    </div>
  </div>

  <div class="summary">
    <div class="summary-card"><div class="value">${steps.length}</div><div class="label">Steps</div></div>
    <div class="summary-card"><div class="value">${utilization.toFixed(1)}%</div><div class="label">Volume</div></div>
    <div class="summary-card"><div class="value">${totalWeight.toLocaleString()}</div><div class="label">Total lbs</div></div>
    <div class="summary-card"><div class="value">${dist.front.toFixed(0)}/${dist.back.toFixed(0)}</div><div class="label">F/B Balance</div></div>
  </div>

  <div class="strategy">
    <h3>Loading Strategy</h3>
    ${getLoadingStrategyPrintable(items, container)}
  </div>

  ${steps.map(step => {
    const catText = getCategoryText(step.item.category);
    return `
    <div class="step">
      <div class="step-head">
        <div class="step-num">${step.stepNumber}</div>
        <div class="step-info">
          <div class="step-name">${step.item.label} <span class="cat ${step.item.category}">${catText}</span></div>
          <div class="step-specs">${formatDimensions(step.item.lengthIn, step.item.widthIn, step.item.heightIn)} | ${step.item.weightLbs.toLocaleString()} lbs</div>
        </div>
        ${step.snapshotDataUrl ? `<div class="step-img"><img src="${step.snapshotDataUrl}" /></div>` : ''}
      </div>
      <div class="instruction">${step.instruction}</div>
      <div class="pos-grid">
        <div class="pos-cell"><div class="plabel">X Pos</div><div class="pvalue">${step.item.posX.toFixed(0)}"</div></div>
        <div class="pos-cell"><div class="plabel">Y Height</div><div class="pvalue">${step.item.posY.toFixed(0)}"</div></div>
        <div class="pos-cell"><div class="plabel">Z Pos</div><div class="pvalue">${step.item.posZ.toFixed(0)}"</div></div>
        <div class="pos-cell"><div class="plabel">Cum. Wt</div><div class="pvalue">${step.cumulativeWeight.toLocaleString()} lbs</div></div>
      </div>
      ${step.tips.length > 0 ? step.tips.map(t => `<div class="tip">${t}</div>`).join('') : ''}
      <div style="margin-top:6px">
        <div style="font-size:9px;color:#999;margin-bottom:3px">Progress: ${step.cumulativeUtilization.toFixed(1)}% volume</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(step.cumulativeUtilization, 100)}%"></div></div>
      </div>
    </div>
  `;}).join('')}

  <div class="footer">A3 Shipping Pro -- Load Plan -- ${new Date().toLocaleString()}</div>
</body>
</html>`;
}

/**
 * Print-safe loading strategy (no emojis, no special unicode).
 */
function getLoadingStrategyPrintable(items: CargoItem[], container: ContainerSpec): string {
  const heavyItems = items.filter(i => i.category === 'heavy' || i.weightLbs > 500);
  const fragileItems = items.filter(i => i.category === 'fragile');
  const hazItems = items.filter(i => i.category === 'hazardous');
  const perishItems = items.filter(i => i.category === 'perishable');
  const stackedItems = items.filter(i => i.posY > 1);
  const floorItems = items.filter(i => i.posY <= 1);

  const points: string[] = [];

  points.push(`<strong>${floorItems.length}</strong> items on the floor level, <strong>${stackedItems.length}</strong> stacked above.`);

  if (heavyItems.length > 0) {
    points.push(`<strong>${heavyItems.length}</strong> heavy item(s) -- load these first to establish a stable base.`);
  }
  if (fragileItems.length > 0) {
    points.push(`<strong>${fragileItems.length}</strong> fragile item(s) -- place on top or protected areas. Avoid stacking heavy items above.`);
  }
  if (hazItems.length > 0) {
    points.push(`<strong>${hazItems.length}</strong> hazardous item(s) -- follow IMDG/DOT separation requirements.`);
  }
  if (perishItems.length > 0) {
    points.push(`<strong>${perishItems.length}</strong> perishable item(s) -- load last for first-out access. Maintain cold chain.`);
  }

  const dist = getWeightDistribution(items, container);
  if (Math.abs(dist.front - dist.back) > 20) {
    points.push(`NOTE: Weight is unevenly distributed front/back (${dist.front.toFixed(0)}%/${dist.back.toFixed(0)}%). Consider redistributing.`);
  } else {
    points.push(`Weight distribution is balanced (Front: ${dist.front.toFixed(0)}%, Back: ${dist.back.toFixed(0)}%).`);
  }

  return `<ul>${points.map(p => `<li>${p}</li>`).join('')}</ul>`;
}
