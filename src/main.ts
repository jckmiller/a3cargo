/**
 * Application Entry Point
 *
 * 1. Verifies (or collects) user authentication.
 * 2. Passes the authenticated user into the main application.
 */

import { requireAuth } from './auth';
import { ContainerVizApp } from './game';

async function main(): Promise<void> {
  const user = await requireAuth();
  new ContainerVizApp(user);
}

main();
