import { space } from "@harrhy/ui/styles";
import { clientEntry, css, on, ref, type Handle } from "remix/component";

import { Button } from "@harrhy/ui/native";
import { Alert } from "../primitives.tsx";

const noticeStyle = css({
  position: "fixed",
  insetBlockStart: "max(0.75rem, env(safe-area-inset-top))",
  insetInline: "0.75rem",
  marginInline: "auto",
  width: "fit-content",
  maxWidth: "calc(100% - 1.5rem)",
  zIndex: 110,
});
const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: space(1.5),
  textAlign: "center",
});
const closeStyle = css({
  padding: 0,
  width: "1.75rem",
  minHeight: "1.75rem",
  lineHeight: 1,
});

export const MovedNotice = clientEntry(
  `${import.meta.url}#MovedNotice`,
  function MovedNotice(handle: Handle) {
    let dismissed = false;
    return () =>
      dismissed ? null : (
        <div mix={noticeStyle}>
          <Alert tone="info">
            <div mix={rowStyle}>
              <span>
                Artbin is now on <strong>artbin.harrhy.xyz</strong>, please
                update your bookmarks!
              </span>
              <span
                hidden
                mix={ref((element) => element.removeAttribute("hidden"))}
              >
                <Button
                  type="button"
                  aria-label="Dismiss bookmark notice"
                  mix={[
                    closeStyle,
                    on("click", () => {
                      const url = new URL(location.href);
                      // Keep the original encoding and order of all unrelated parameters.
                      url.search = url.search
                        .slice(1)
                        .split("&")
                        .filter(
                          (part) =>
                            !new URLSearchParams(`?${part}`).has("moved"),
                        )
                        .join("&");
                      history.replaceState(history.state, "", url);
                      dismissed = true;
                      handle.update();
                    }),
                  ]}
                >
                  <span aria-hidden="true">×</span>
                </Button>
              </span>
            </div>
          </Alert>
        </div>
      );
  },
);
