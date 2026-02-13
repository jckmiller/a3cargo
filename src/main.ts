/**
 * Application Entry Point
 * 
 * Initializes and starts the A3 Shipping Pro application.
 * This file is loaded by the browser and kicks off the entire application.
 */

import { ContainerVizApp } from "./game";

/**
 * Main application initialization function.
 * Creates a new instance of the ContainerVizApp which:
 * - Sets up the 3D scene with Three.js
 * - Builds the user interface
 * - Initializes event listeners
 * - Loads saved preferences
 * - Starts the animation loop
 */
function main(): void {
  new ContainerVizApp();
}

// Start the application when this module loads
main();
