import * as s from "@harrhy/json-schema";
import { bindTool, defineTool } from "../src/index.ts";

const tool = defineTool({
  name: "typed",
  input: s.object({
    value: s.string().transform((value) => value.length, s.number()),
  }),
  output: s.object({ length: s.number().transform(String, s.string()) }),
});
const validation = {
  invalidInput: () => ({ content: [], isError: true }),
  invalidOutput: () => ({ content: [], isError: true }),
};
bindTool(
  tool,
  ({ value }) => {
    const length: number = value;
    // @ts-expect-error Handler input is the schema output, not the wire string.
    const raw: string = value;
    void raw;
    return { content: [], structuredContent: { length } };
  },
  validation,
);
bindTool(
  tool,
  // @ts-expect-error The handler returns the output schema's input, before its string transform.
  () => ({ content: [], structuredContent: { length: "wrong" } }),
  validation,
);
// @ts-expect-error A tool definition requires its protocol name.
defineTool({ input: s.object({}) });
bindTool(
  tool,
  // @ts-expect-error No invented ambient Remix context: capture the authorized context in a closure.
  (_input: unknown, context: { user: { id: number } }) => ({
    content: [],
    structuredContent: { length: context.user.id },
  }),
  validation,
);
