import {
  Field,
  Badge,
  Button,
  Checkbox,
  Input,
  NavigationMenu,
  NavigationMenuLink,
  Notice,
  Panel,
  Textarea,
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@harrhy/ui/native";
import type { Handle } from "remix/component";
import { getContext } from "remix/middleware/async-context";
import { getCspNonce } from "remix/middleware/csp";
import { AdminBrand } from "../app/ui/admin-brand.tsx";
import { Document } from "../app/ui/document.tsx";
import { designStyles } from "./design-styles.ts";
import { operatorStyles } from "./operator-styles.ts";
import { DesignVisibility } from "./public/design-fields.tsx";

const colors = [
  ["--canvas", "Page background"],
  ["--paper", "Fields and panels"],
  ["--surface", "Quiet controls"],
  ["--surface-hover", "Control hover"],
  ["--ink", "Main text"],
  ["--muted", "Secondary text"],
  ["--line", "Borders"],
  ["--field-border", "Field hover"],
  ["--tea", "Warm detail"],
  ["--accent", "Primary action"],
  ["--accent-hover", "Primary hover"],
  ["--accent-soft", "Positive background"],
  ["--on-accent", "Text on green"],
  ["--danger", "Errors and destructive actions"],
  ["--danger-hover", "Destructive hover"],
  ["--danger-soft", "Error background"],
  ["--danger-soft-hover", "Destructive control hover"],
  ["--shadow", "Dialog shadow"],
  ["--backdrop", "Dialog backdrop"],
] as const;

const links = [
  ["#colors", "Colors"],
  ["#type", "Type"],
  ["#shape", "Shape"],
  ["#buttons", "Buttons"],
  ["#fields", "Fields"],
  ["#feedback", "Feedback"],
  ["#patterns", "Patterns"],
] as const;

function ColorToken(handle: Handle<{ name: string; use: string }>) {
  return () => (
    <div className="design-color">
      <span
        className="design-color-swatch"
        style={{ backgroundColor: `var(${handle.props.name})` }}
      />
      <span className="design-color-meta">
        <strong>{handle.props.name}</strong>
        <small>{handle.props.use}</small>
        <code data-token-value={handle.props.name}></code>
      </span>
    </div>
  );
}

export function Design(_handle: Handle) {
  return () => (
    <Document
      title="Design · teacms"
      admin
      styles={[operatorStyles, designStyles]}
      head={
        <>
          <script
            src="/design.js"
            nonce={getCspNonce(getContext())}
            defer
          ></script>
        </>
      }
    >
      <a className="skip-link" href="#design-content">
        Skip to content
      </a>
      <header className="design-header">
        <AdminBrand href="/" />
        <NavigationMenu aria-label="Page links">
          <NavigationMenuLink href="#colors">Colors</NavigationMenuLink>
          <NavigationMenuLink href="#patterns">Patterns</NavigationMenuLink>
          <NavigationMenuLink href="/login">Sign in</NavigationMenuLink>
        </NavigationMenu>
      </header>
      <div className="design-layout">
        <aside className="design-index" aria-label="On this page">
          <span>On this page</span>
          <NavigationMenu aria-label="Design sections">
            {links.map(([href, label]) => (
              <NavigationMenuLink href={href}>{label}</NavigationMenuLink>
            ))}
          </NavigationMenu>
        </aside>
        <main id="design-content" className="design-main">
          <div className="design-intro">
            <h1>Design</h1>
            <p>Colors, type, controls, and patterns used in the editor.</p>
          </div>

          <section className="design-section" id="colors">
            <div className="design-section-head">
              <div>
                <h2>Colors</h2>
                <p>
                  These are the live CSS values. The page reads them from the
                  admin stylesheet.
                </p>
              </div>
            </div>
            <div className="design-colors">
              {colors.map(([name, use]) => (
                <ColorToken name={name} use={use} />
              ))}
            </div>
          </section>

          <section className="design-section" id="type">
            <div className="design-section-head">
              <div>
                <h2>Type</h2>
                <p>Inter Variable, served by teacms. Weights 100–900.</p>
              </div>
            </div>
            <div className="design-type-list">
              <div className="design-type-row">
                <small>Heading 1 · 26–34px</small>
                <h1>Make a page, then make it yours.</h1>
              </div>
              <div className="design-type-row">
                <small>Heading 2 · 20px</small>
                <h2>Pages and media</h2>
              </div>
              <div className="design-type-row">
                <small>Heading 3 · 14px</small>
                <h3>Search &amp; sharing</h3>
              </div>
              <div className="design-type-row">
                <small>Body · 14px / 1.5</small>
                <p>
                  Drafts stay private until you publish them. You can keep
                  editing without changing the live page.
                </p>
              </div>
              <div className="design-type-row">
                <small>Small · 12px</small>
                <small>Updated a moment ago</small>
              </div>
            </div>
          </section>

          <section className="design-section" id="shape">
            <div className="design-section-head">
              <div>
                <h2>Shape &amp; spacing</h2>
                <p>
                  Light borders and small corners keep dense screens easy to
                  scan.
                </p>
              </div>
            </div>
            <div className="design-shapes">
              <div className="design-shape-card">
                <div className="design-radius-panel"></div>
                <strong>Panel radius</strong>
                <code data-token-value="--radius"></code>
              </div>
              <div className="design-shape-card">
                <div className="design-radius-control"></div>
                <strong>Control radius</strong>
                <code data-token-value="--radius-control"></code>
              </div>
              <div className="design-shape-card">
                <div className="design-focus-example" tabIndex={0}>
                  Tab to focus
                </div>
                <strong>Focus outline</strong>
                <code>3px solid --accent</code>
              </div>
            </div>
            <p className="design-note">
              Spacing is currently set per component; there is no shared spacing
              scale.
            </p>
          </section>

          <section className="design-section" id="buttons">
            <div className="design-section-head">
              <div>
                <h2>Buttons</h2>
                <p>
                  Actions use the shared Clean theme. Destructive actions are
                  labelled explicitly.
                </p>
              </div>
            </div>
            <Panel className="design-sample">
              <div className="design-button-row">
                <Button type="button" variant="primary">
                  Publish page
                </Button>
                <Button type="button">Save draft</Button>
                <Button type="button" variant="danger">
                  Delete
                </Button>
                <Button type="button">Small button</Button>
                <Button type="button" variant="quiet">
                  Text button
                </Button>
                <Button type="button" variant="danger">
                  Destructive text
                </Button>
                <Button type="button" disabled variant="primary">
                  Unavailable
                </Button>
              </div>
              <p className="design-caption">
                Controls use shared theme sizing. Hover to compare the states.
              </p>
            </Panel>
          </section>

          <section className="design-section" id="fields">
            <div className="design-section-head">
              <div>
                <h2>Fields</h2>
                <p>
                  Labels stay visible; help text sits below the field it
                  explains.
                </p>
              </div>
            </div>
            <Panel className="design-sample design-form-sample">
              <div className="field-grid">
                <Field
                  id="design-field-1"
                  label="Page title"
                  description="Shown in the editor and on the website."
                >
                  <Input type="text" placeholder="A new page" />
                </Field>
                <DesignVisibility />
              </div>
              <Field id="design-field-2" label="Description">
                <Textarea
                  rows={3}
                  placeholder="A short description for search and sharing."
                />
              </Field>
              <label className="check-label">
                <Checkbox defaultChecked />
                Show in navigation
              </label>
            </Panel>
          </section>

          <section className="design-section" id="feedback">
            <div className="design-section-head">
              <div>
                <h2>Feedback</h2>
                <p>State labels use words as well as color.</p>
              </div>
            </div>
            <Panel className="design-sample">
              <div className="design-badges">
                <Badge>Published</Badge>
                <Badge>Draft</Badge>
                <Badge>Unavailable</Badge>
                <Badge>12</Badge>
              </div>
              <Notice>Draft saved. The live page has not changed.</Notice>
              <Notice tone="danger">This file is too large to upload.</Notice>
              <div className="design-empty empty-state">
                <strong>No pages yet</strong>
                <p>Create a page to start adding content.</p>
                <Button type="button" variant="primary">
                  New page
                </Button>
              </div>
            </Panel>
          </section>

          <section className="design-section" id="patterns">
            <div className="design-section-head">
              <div>
                <h2>Patterns</h2>
                <p>Fixture content in the same layouts used by the app.</p>
              </div>
            </div>
            <div className="design-pattern">
              <div className="design-pattern-label">Page list row</div>
              <TableContainer>
                <Table aria-label="Example pages">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Page</TableHead>
                      <TableHead>Content</TableHead>
                      <TableHead>Search</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <div className="page-identity">
                          <span className="page-monogram">N</span>
                          <span>
                            <strong>Notes</strong>
                            <small>/notes · Unpublished changes</small>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>4 blocks</TableCell>
                      <TableCell>
                        <Badge>Needs description</Badge>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </div>
            <div className="design-pattern">
              <div className="design-pattern-label">Review item</div>
              <div className="task-row">
                <strong>Page descriptions</strong>
                <p>2 pages need a description.</p>
              </div>
            </div>
            <div className="design-pattern">
              <div className="design-pattern-label">Search preview</div>
              <div className="seo-preview">
                <div>
                  <span className="search-url">example.com/notes</span>
                  <h3>Notes · Example site</h3>
                  <p>Short updates from the studio.</p>
                  <ul
                    className="seo-checks"
                    aria-label="Search and sharing details"
                  >
                    <li>Page description set</li>
                    <li>Add a sharing image</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="design-pattern">
              <div className="design-pattern-label">Media tile</div>
              <div className="design-media-fixture">
                <div className="media-tile">
                  <div className="file-preview">PNG</div>
                  <span>
                    <strong>cover-image.png</strong>
                    <small>Image · 240 KB</small>
                  </span>
                </div>
              </div>
            </div>
            <div className="design-pattern">
              <div className="design-pattern-label">Editor actions</div>
              <Panel className="design-editor-fixture">
                <div className="editor-heading">
                  <div>
                    <span className="back-link">← Pages</span>
                    <h1>Notes</h1>
                    <span className="muted">/notes ↗</span>
                  </div>
                  <div className="editor-actions">
                    <span className="save-status pending">Unsaved changes</span>
                    <Button type="button">Save draft</Button>
                    <Button type="button" variant="primary">
                      Publish
                    </Button>
                  </div>
                </div>
                <div className="editor-toolbar">
                  <div>
                    <Button type="button">↶ Undo</Button>
                    <Button type="button" disabled>
                      ↷ Redo
                    </Button>
                  </div>
                </div>
              </Panel>
            </div>
            <div className="design-pattern">
              <div className="design-pattern-label">Site summary</div>
              <div className="operator-sites">
                <Panel className="operator-site">
                  <div className="operator-site-info">
                    <div className="operator-site-head">
                      <h2>Example site</h2>
                      <Badge>Healthy</Badge>
                    </div>
                    <p className="operator-description">
                      A fixture site for this design page.
                    </p>
                    <span className="operator-origin">example.com ↗</span>
                  </div>
                  <dl className="operator-facts">
                    <div>
                      <dt>Pages</dt>
                      <dd>8</dd>
                    </div>
                    <div>
                      <dt>Drafts</dt>
                      <dd>2</dd>
                    </div>
                    <div>
                      <dt>Media</dt>
                      <dd>14</dd>
                    </div>
                    <div>
                      <dt>Mode</dt>
                      <dd>Preview</dd>
                    </div>
                    <div>
                      <dt>Analytics</dt>
                      <dd>Off</dd>
                    </div>
                  </dl>
                  <div>
                    <Button type="button" variant="primary">
                      Open editor
                    </Button>
                  </div>
                </Panel>
              </div>
            </div>
          </section>
          <footer className="design-footer">
            <AdminBrand href="/" />
            <a href="#design-content">Back to top ↑</a>
          </footer>
        </main>
      </div>
    </Document>
  );
}
