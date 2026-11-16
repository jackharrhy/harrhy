import {
  Field,
  Badge,
  Button,
  ButtonLink,
  Input,
  Notice,
  Panel,
} from "@harrhy/ui/native";
import type { Handle } from "remix/component";
import { Document } from "../app/ui/document.tsx";
import { AdminBrand } from "../app/ui/admin-brand.tsx";
import { operatorStyles } from "./operator-styles.ts";
import type { BackupStatus } from "../backup/service.ts";

export type Summary = {
  id: string;
  name: string;
  origin: string;
  description: string;
  preview: boolean;
  healthy: boolean;
  pages: number;
  drafts: number;
  media: number;
  analytics: boolean;
};

export function Login(
  handle: Handle<{ error?: string; csrf: string; central?: boolean }>,
) {
  return () => (
    <Document title="Sign in · teacms" admin static styles={[operatorStyles]}>
      <main className="operator-login">
        <AdminBrand href="/" />
        <Panel className="operator-login-panel">
          <h1>Sign in</h1>
          {handle.props.error && (
            <Notice role="alert" tone="danger">
              {handle.props.error}
            </Notice>
          )}
          {handle.props.central ? (
            <ButtonLink href="/auth/login" data-rmx-document variant="primary">
              Sign in
            </ButtonLink>
          ) : (
            <form method="post" action="/login" data-rmx-document>
              <input type="hidden" name="csrf" value={handle.props.csrf} />
              <Field id="ui-field-1" label="Email address">
                <Input
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  autoFocus
                />
              </Field>
              <Field id="ui-field-2" label="Password">
                <Input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </Field>
              <Button type="submit" variant="primary">
                Sign in
              </Button>
            </form>
          )}
        </Panel>
        <a className="operator-design-link" href="/design">
          Design
        </a>
      </main>
    </Document>
  );
}

export function Dashboard(
  handle: Handle<{
    email: string;
    sites: Summary[];
    csrf: string;
    backup?: BackupStatus;
  }>,
) {
  return () => (
    <Document title="Sites · teacms" admin static styles={[operatorStyles]}>
      <main className="operator-shell">
        <header className="operator-header">
          <AdminBrand href="/" />
          <div className="operator-account">
            <a href="/design">Design</a>
            <span>{handle.props.email}</span>
            <form method="post" action="/logout" data-rmx-document>
              <input type="hidden" name="csrf" value={handle.props.csrf} />
              <Button type="submit" variant="quiet">
                Sign out
              </Button>
            </form>
          </div>
        </header>
        <div className="operator-heading">
          <h1>Sites</h1>
        </div>
        {handle.props.backup && (
          <Panel aria-label="Backups" className="operator-site">
            <div className="operator-site-info">
              <h2>Backups</h2>
              <p>
                {!handle.props.backup.enabled
                  ? "Not configured"
                  : handle.props.backup.lastError
                    ? "Needs attention"
                    : handle.props.backup.running
                      ? "Backup in progress"
                      : "Scheduled"}
              </p>
              <p>
                Last verified snapshot:{" "}
                {handle.props.backup.lastSuccess ?? "None"}
              </p>
              <p>Next due: {handle.props.backup.nextDue ?? "On startup"}</p>
              <p>
                {handle.props.backup.completed} snapshot
                {handle.props.backup.completed === 1 ? "" : "s"} ·{" "}
                {handle.props.backup.bytes} bytes · keep{" "}
                {handle.props.backup.retention} · every{" "}
                {handle.props.backup.intervalSeconds} seconds
              </p>
              {handle.props.backup.lastError && (
                <Notice role="alert" tone="danger">
                  {handle.props.backup.lastError}
                </Notice>
              )}
              <p>
                Local recovery only. Off-host replication and restore drills are
                separate protections.
              </p>
            </div>
          </Panel>
        )}
        <div className="operator-sites">
          {handle.props.sites.map((site) => (
            <Panel className="operator-site">
              <div className="operator-site-info">
                <div className="operator-site-head">
                  <h2>{site.name}</h2>
                  <Badge>{site.healthy ? "Healthy" : "Unavailable"}</Badge>
                </div>
                {site.description && (
                  <p className="operator-description">{site.description}</p>
                )}
                <a
                  className="operator-origin"
                  href={site.origin}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Visit ${site.name} website`}
                >
                  {new URL(site.origin).host} ↗
                </a>
              </div>
              <dl className="operator-facts">
                <div>
                  <dt>Pages</dt>
                  <dd>{site.pages}</dd>
                </div>
                <div>
                  <dt>Drafts</dt>
                  <dd>{site.drafts}</dd>
                </div>
                <div>
                  <dt>Media</dt>
                  <dd>{site.media}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{site.preview ? "Preview" : "Live"}</dd>
                </div>
                <div>
                  <dt>Analytics</dt>
                  <dd>{site.analytics && !site.preview ? "On" : "Off"}</dd>
                </div>
              </dl>
              <form
                method="post"
                action={`/enter/${site.id}`}
                data-rmx-document
              >
                <input type="hidden" name="csrf" value={handle.props.csrf} />
                <Button
                  type="submit"

                  disabled={!site.healthy}
                  aria-label={`Open ${site.name} editor`}
                  variant="primary"
                >
                  Open editor
                </Button>
              </form>
            </Panel>
          ))}
        </div>
      </main>
    </Document>
  );
}
