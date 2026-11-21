import { createRouter } from "remix/router";

const readPaths = ["/", "/viewer.js"];
export default {
  fetch(request, env) {
    if (request.method !== "GET") return new Response(null, { status: 405 });
    const router = createRouter();
    for (const path of readPaths)
      router.get(path, () => env.ASSETS.fetch(request));
    return router.fetch(request);
  },
};
