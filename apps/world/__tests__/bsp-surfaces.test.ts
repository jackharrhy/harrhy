import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseBsp } from "@harrhy/worldview-renderer/core";
import * as THREE from "three/webgpu";
import { createHallSurfaces } from "../app/bsp-surfaces.ts";

const world = parseBsp(
  readFileSync(new URL("../content/hall.bsp", import.meta.url)),
);

test("World surface hits agree with its depth geometry in metres", () => {
  const hall = createHallSurfaces(world);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(hall.geometry, material);
  const origin = new THREE.Vector3(0.25, 1.5, 0.1);
  for (const direction of [
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(1, 0, 0),
  ]) {
    const ray = new THREE.Raycaster(origin, direction, 0.04, 60);
    const depthHit = ray.intersectObject(mesh)[0];
    const hit = hall.pick(ray);
    assert.ok(depthHit && hit);
    assert.ok(Math.abs(hit.distance - depthHit.distance) < 1e-6);
    assert.ok(hit.point.distanceTo(depthHit.point) < 1e-6);
    assert.ok(hit.normal.dot(direction) < 0);
    ray.far = hit.distance / 2;
    assert.equal(hall.pick(ray), undefined);
  }
  material.dispose();
  hall.geometry.dispose();
});
