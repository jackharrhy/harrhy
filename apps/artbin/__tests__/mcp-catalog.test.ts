import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { expect, test } from "vitest";
import { mcpTools } from "../app/operations/catalog.ts";
import { folderManageInput } from "../app/operations/folders.ts";
import { importQueueInput } from "../app/operations/imports.ts";

test("the complete published catalog is accepted by MCP clients", () => {
  expect(() => ListToolsResultSchema.parse({ tools: mcpTools })).not.toThrow();
});

test("published object unions preserve branch and confirmation validation", () => {
  const validator = new AjvJsonSchemaValidator();
  const cases = [
    {
      name: "artbin_folder_manage",
      schema: folderManageInput,
      valid: [
        {
          operation: "rename",
          slug: "textures",
          name: "Materials",
          execution: { mode: "plan" },
        },
        {
          operation: "move",
          slug: "textures",
          destinationSlug: null,
          execution: { mode: "apply", confirm: true },
        },
      ],
      invalid: [
        {
          operation: "move",
          slug: "textures",
          name: "Materials",
          execution: { mode: "plan" },
        },
        {
          operation: "rename",
          slug: "textures",
          name: "Materials",
          execution: { mode: "apply", confirm: false },
        },
      ],
    },
    {
      name: "artbin_import_queue",
      schema: importQueueInput,
      valid: [
        {
          kind: "remote",
          sourceUrls: ["https://example.test/texture.png"],
          targetFolderId: null,
          confirm: true,
        },
        { kind: "folder", sourcePath: "/textures", confirm: true },
        { kind: "catalog", source: "texturetown", confirm: true },
      ],
      invalid: [
        { kind: "remote", sourcePath: "/textures", confirm: true },
        { kind: "catalog", source: "texturetown", confirm: false },
      ],
    },
  ];
  for (const { name, schema, valid, invalid } of cases) {
    const descriptor = mcpTools.find((tool) => tool.name === name)!;
    const validate = validator.getValidator(descriptor.inputSchema);
    for (const input of valid) {
      expect(schema.safeParse(input).success).toBe(true);
      expect(validate(input)).toMatchObject({ valid: true });
    }
    for (const input of invalid) {
      expect(schema.safeParse(input).success).toBe(false);
      expect(validate(input).valid).toBe(false);
    }
  }
});
