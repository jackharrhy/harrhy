import {
  Field,
  Badge,
  Button,
  ButtonLink,
  Collapsible,
  CollapsibleTrigger,
  Input,
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@harrhy/ui/native";
import type { SiteRuntime } from "../../site.ts";
import type { Handle } from "remix/component";
import type { Page } from "../../ui/public/content-types.ts";
import { AdminLayout } from "./layout.tsx";
import { mediaUrl } from "../block-renderer.ts";

export function Pages(
  handle: Handle<{
    site: SiteRuntime;
    pages: Page[];
    query: string;
    operatorOrigin?: string;
  }>,
) {
  return () => (
    <AdminLayout
      siteName={handle.props.site.name}
      operatorOrigin={handle.props.operatorOrigin}
      adornments={handle.props.site.definition.features.adornments}
      title="Pages"
      path="/tea/admin/pages"
    >
      <div className="page-heading">
        <div>
          <h1>
            Pages<Badge>{handle.props.pages.length}</Badge>
          </h1>
        </div>
        <ButtonLink href="#new-page" variant="primary">
          + New page
        </ButtonLink>
      </div>
      <form className="search-bar" method="get" data-rmx-document>
        <Input
          aria-label="Search pages"
          name="q"
          type="search"
          placeholder="Find a page…"
          defaultValue={handle.props.query}
        />
        <Button type="submit">Search</Button>
      </form>
      <TableContainer>
        <Table aria-label="Pages">
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead>Content</TableHead>
              <TableHead>Search</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {handle.props.pages.map((p) => {
              const image = p.blocks.find((b) => b.type === "media")?.props
                .mediaId;
              return (
                <TableRow>
                  <TableCell>
                    <a
                      className="page-identity"
                      href={"/tea/admin/pages/" + p.slug}
                      data-rmx-document
                    >
                      {image ? (
                        <img src={mediaUrl(image)} alt="" loading="lazy" />
                      ) : (
                        <span className="page-monogram">
                          {p.title.slice(0, 1)}
                        </span>
                      )}
                      <span>
                        <strong>{p.title}</strong>
                        <small>
                          /{p.slug} ·{" "}
                          {p.hasDraft
                            ? p.published
                              ? "Unpublished changes"
                              : "Draft"
                            : "Published"}
                        </small>
                      </span>
                    </a>
                  </TableCell>
                  <TableCell>{p.blocks.length} blocks</TableCell>
                  <TableCell>
                    <Badge>
                      {p.seo.no_index
                        ? "Hidden"
                        : p.seo.description
                          ? "Ready"
                          : "Needs description"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {!handle.props.pages.length && (
              <TableRow>
                <TableCell colSpan={3}>
                  No pages found. Try another search or create a page.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Collapsible className="new-page" id="new-page">
        <CollapsibleTrigger>Create a new page</CollapsibleTrigger>
        <form method="post" action="/tea/admin/pages" data-rmx-document>
          <div className="field-grid">
            <Field id="pages-field-1" label="Page title">
              <Input name="title" required placeholder="A new project" />
            </Field>
            <Field
              id="pages-field-2"
              label="Website URL"
              description="Lowercase words separated by hyphens."
            >
              <Input
                name="slug"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="a-new-project"
              />
            </Field>
          </div>
          <Button variant="primary" type="submit">
            Create page →
          </Button>
        </form>
      </Collapsible>
    </AdminLayout>
  );
}
