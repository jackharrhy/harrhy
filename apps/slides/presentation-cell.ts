import { DurableObject } from "cloudflare:workers";

// Retain the v1 namespace without opening or modifying its stored presentations.
export class PresentationCell extends DurableObject<Env> {
  fetch() {
    return new Response(null, { status: 404 });
  }
}
