import { seedAndSnapshot } from './emulators';

/** Runs once, after the emulators and the app are up: loads the Git course. */
export default async function globalSetup(): Promise<void> {
  await seedAndSnapshot();
}
