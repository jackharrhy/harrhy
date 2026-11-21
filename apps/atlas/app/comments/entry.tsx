import { createRoot } from "remix/component";
import { Comments } from "./client.tsx";

const mount = document.getElementById("atlas-comments-mount");
if (mount) {
  const failed = () => {
    mount.textContent = "Comments unavailable. Reload to try again.";
  };
  try {
    const root = createRoot(mount);
    root.addEventListener("error", failed);
    root.render(<Comments />);
    root.flush();
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) root.dispose();
    });
  } catch {
    failed();
  }
}
