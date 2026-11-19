import { clientEntry, css, on, ref, type Handle } from "remix/component";

import { Button } from "@harrhy/ui/native";
import { Alert } from "../primitives.tsx";

const noticeStyle = css({ textAlign: "center" });

export const MovedNotice = clientEntry(
  `${import.meta.url}#MovedNotice`,
  function MovedNotice(handle: Handle) {
    let dismissed = false;
    return () =>
      dismissed ? null : (
        <div mix={noticeStyle}>
          <Alert tone="info">
            <span>
              Artbin is now on <strong>artbin.harrhy.xyz</strong>, please update
              your bookmarks!
            </span>
            <div>
              <span
                hidden
                mix={ref((element) => element.removeAttribute("hidden"))}
              >
                <Button
                  type="button"
                  mix={on("click", () => {
                    const url = new URL(location.href);
                    // Keep the original encoding and order of all unrelated parameters.
                    url.search = url.search
                      .slice(1)
                      .split("&")
                      .filter(
                        (part) => !new URLSearchParams(`?${part}`).has("moved"),
                      )
                      .join("&");
                    history.replaceState(history.state, "", url);
                    dismissed = true;
                    handle.update();
                  })}
                >
                  Dismiss bookmark notice
                </Button>
              </span>
            </div>
          </Alert>
        </div>
      );
  },
);
