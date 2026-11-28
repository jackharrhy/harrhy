import { Dialog } from "@harrhy/ui/interactive";
import { Input, Text } from "@harrhy/ui/native";
import { css, on, ref, type Handle } from "remix/component";

export type PaletteItem = { id: string; label: string; detail: string };
export function Switcher(
  handle: Handle<{
    open: boolean;
    scoped: boolean;
    items: PaletteItem[];
    close(): void;
    select(id: string): void;
  }>,
) {
  let query = "";
  let activeId: string | undefined;
  let outside = false;
  let list: HTMLUListElement | undefined;
  const listId = `${handle.id}-results`;
  const optionId = (id: string) => `${listId}-${encodeURIComponent(id)}`;
  const bindList = ref<HTMLUListElement>((node) => {
    list = node;
  });
  return () => {
    const { open, scoped, items, close, select } = handle.props;
    if (!open) {
      query = "";
      activeId = undefined;
      outside = false;
    }
    const terms = query.toLowerCase().trim().split(/\s+/);
    const matches = items.filter((item) =>
      terms.every((term) =>
        `${item.label} ${item.detail}`.toLowerCase().includes(term),
      ),
    );
    const active = matches.find((item) => item.id === activeId) ?? matches[0];
    if (open) {
      activeId = active?.id;
      if (active)
        handle.queueTask(() => {
          if (list?.closest("dialog")?.open)
            document
              .getElementById(optionId(active.id))
              ?.scrollIntoView({ block: "nearest" });
        });
    }
    return (
      <Dialog
        open={open}
        title={scoped ? "Switch conversation" : "Command palette"}
        initialFocus="input"
        onClose={close}
        mix={[
          css({
            insetBlockStart: "min(12dvh, 96px)",
            marginBlockStart: 0,
            boxSizing: "border-box",
            width: "min(36rem, calc(100% - 24px))",
            maxHeight: "70dvh",
            padding: "12px",
            "&::backdrop": { background: "rgb(0 0 0 / 0.22)" },
          }),
          on("pointerdown", (event) => {
            outside = event.target === event.currentTarget;
          }),
          on("click", (event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (
              outside &&
              event.target === event.currentTarget &&
              (event.clientX < bounds.left ||
                event.clientX >= bounds.right ||
                event.clientY < bounds.top ||
                event.clientY >= bounds.bottom)
            )
              close();
            outside = false;
          }),
        ]}
      >
        <Input
          aria-label={
            scoped ? "Find a conversation" : "Find a command or conversation"
          }
          placeholder={
            scoped
              ? "Search conversations…"
              : "Search commands and conversations…"
          }
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && active ? optionId(active.id) : undefined
          }
          value={query}
          mix={[
            css({ width: "100%", boxSizing: "border-box" }),
            on("input", (event) => {
              query = event.currentTarget.value;
              activeId = undefined;
              void handle.update();
            }),
            on("keydown", (event) => {
              if (event.isComposing || event.keyCode === 229 || !active) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const index = matches.findIndex(
                  (item) => item.id === active.id,
                );
                activeId =
                  matches[
                    (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      matches.length) %
                      matches.length
                  ].id;
                void handle.update();
              } else if (event.key === "Enter" && !event.repeat) {
                event.preventDefault();
                select(active.id);
              }
            }),
          ]}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Commands and conversations"
          mix={[
            bindList,
            css({
              listStyle: "none",
              marginBlock: "8px 0",
              padding: 0,
              maxHeight: "min(44dvh, 22rem)",
              overflow: "auto",
              overscrollBehavior: "contain",
            }),
          ]}
        >
          {matches.map((item) => (
            <li
              key={item.id}
              id={optionId(item.id)}
              role="option"
              aria-selected={active?.id === item.id}
              mix={[
                css({
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  minHeight: "44px",
                  paddingInline: "10px",
                  borderRadius: "4px",
                  overflowWrap: "anywhere",
                  cursor: "pointer",
                  "&[aria-selected=true]": {
                    background: "var(--hui-selected-surface)",
                  },
                  "&:hover": { textDecoration: "underline" },
                }),
                on("click", () => select(item.id)),
              ]}
            >
              <span>{item.label}</span>
              <span mix={css({ fontSize: "12px", color: "var(--hui-muted)" })}>
                {item.detail}
              </span>
            </li>
          ))}
        </ul>
        {!matches.length && (
          <Text role="status" tone="muted">
            No matching commands or conversations.
          </Text>
        )}
      </Dialog>
    );
  };
}
