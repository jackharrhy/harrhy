import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from "@harrhy/ui/interactive";
import { Button, Heading, Input, Text } from "@harrhy/ui/native";
import { css, on, ref, type Handle } from "remix/component";
import { MAX_TITLE, type Catalog, type Row } from "../pi/catalog.ts";
import { Icon } from "../icons.tsx";
import { iconAction, phone, titleStyle } from "../layout-styles.ts";

const action = css({
  "--hui-control-height": "2rem",
  [phone]: { "--hui-control-height": "2.75rem" },
});

export const sessionTitle = (row: Row) => row.title || "Untitled session";

export function SessionTitle(
  handle: Handle<{
    row: Row;
    rename?: Catalog["rename"];
    subtitle: string;
    switchConversation?: (from?: HTMLElement) => void;
  }>,
) {
  let edit: { draft: string; saving: boolean; error?: string } | undefined;
  let editButton: HTMLButtonElement | undefined;
  const focusButton = ref<HTMLButtonElement>((node) => {
    editButton = node;
  });
  const focusInput = ref<HTMLInputElement>((node) => {
    node.focus();
    node.select();
  });
  async function finish() {
    edit = undefined;
    await handle.update();
    editButton?.focus();
  }
  async function save() {
    if (!edit || edit.saving) return;
    const title = edit.draft.trim();
    if (!title || title.length > MAX_TITLE) {
      edit.error = `Enter a title between 1 and ${MAX_TITLE} characters.`;
      await handle.update();
      return;
    }
    if (title === handle.props.row.title) return finish();
    edit.saving = true;
    edit.error = undefined;
    void handle.update();
    try {
      if (!handle.props.rename) return;
      await handle.props.rename(handle.props.row.id, title);
    } catch {
      if (handle.signal.aborted) return;
      edit.saving = false;
      edit.error = "Could not rename this session. Try again.";
      await handle.update();
      return;
    }
    if (!handle.signal.aborted) await finish();
  }
  return () => {
    const { row } = handle.props;
    const title = sessionTitle(row);
    return (
      <>
        {edit ? (
          <form
            mix={[
              css({ width: "100%", paddingBlock: "0.25rem" }),
              on("submit", (event) => {
                event.preventDefault();
                void save();
              }),
              on("keydown", (event) => {
                if (event.key === "Escape" && !edit?.saving) {
                  event.preventDefault();
                  void finish();
                }
              }),
            ]}
          >
            <div
              mix={css({
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
              })}
            >
              <Input
                aria-label="Session title"
                defaultValue={edit.draft}
                maxLength={MAX_TITLE}
                readOnly={edit.saving}
                aria-invalid={edit.error ? true : undefined}
                mix={[
                  action,
                  css({ minWidth: 0, flex: 1 }),
                  focusInput,
                  on("input", (event) => {
                    if (edit) edit.draft = event.currentTarget.value;
                  }),
                ]}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={edit.saving}
                mix={action}
              >
                {edit.saving ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="quiet"
                disabled={edit.saving}
                mix={[action, on("click", finish)]}
              >
                Cancel
              </Button>
            </div>
            {edit.error && <Text role="alert">{edit.error}</Text>}
          </form>
        ) : (
          <>
            <div
              mix={[
                css({
                  minWidth: 0,
                  flex: 1,
                }),
                on("dblclick", () =>
                  handle.props.switchConversation?.(editButton),
                ),
              ]}
            >
              <Heading level={1} tabindex={-1} mix={titleStyle}>
                <span
                  title={title}
                  mix={css({
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: 1.3,
                  })}
                >
                  {title}
                </span>
              </Heading>
              <div
                title={handle.props.subtitle}
                mix={css({
                  fontSize: "0.6875rem",
                  lineHeight: 1.4,
                  color: "var(--hui-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                })}
              >
                {handle.props.subtitle}
              </div>
            </div>
            <div
              mix={css({
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                marginInlineStart: "auto",
                flex: "none",
              })}
            >
              <Menu label="Session tools">
                <MenuTrigger
                  aria-label="Session tools"
                  disabled={!handle.props.rename}
                  mix={[
                    iconAction,
                    focusButton,
                    css({
                      "&[aria-haspopup]": {
                        background: "transparent",
                        borderColor: "transparent",
                        color: "var(--hui-muted)",
                      },
                      "&[aria-haspopup]:hover": {
                        background: "var(--hui-hover-surface)",
                      },
                    }),
                  ]}
                >
                  <Icon name="more" />
                </MenuTrigger>
                <MenuContent
                  onSelect={(item) => {
                    if (item.name === "conversations") {
                      handle.props.switchConversation?.(editButton);
                      return;
                    }
                    edit = { draft: row.title, saving: false };
                    void handle.update();
                  }}
                >
                  {handle.props.switchConversation && (
                    <MenuItem name="conversations">
                      Switch conversation…
                    </MenuItem>
                  )}
                  <MenuItem name="rename">Rename</MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </>
        )}
      </>
    );
  };
}
