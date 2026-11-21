import { initializePoolPhysics } from "./engine-core.ts";

// Keep the synchronous constructor for existing consumers. Worker hosts should
// use ./session, whose factory initializes Box3D inside the request lifecycle.
await initializePoolPhysics();

export { PoolPhysics } from "./engine-core.ts";
export type { PhysicalBall, PhysicsEvent } from "./engine-core.ts";
