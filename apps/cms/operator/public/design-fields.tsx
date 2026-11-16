import { clientEntry, type Handle } from "remix/component";
import { Field } from "@harrhy/ui/native";
import { Select } from "@harrhy/ui/interactive";

const visibilityOptions = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
] as const;

function DesignVisibilityField(_handle: Handle) {
  return () => (
    <Field id="design-visibility" label="Visibility">
      <Select
        name="visibility"
        defaultValue="published"
        options={visibilityOptions}
      />
    </Field>
  );
}

export const DesignVisibility = clientEntry(
  import.meta.url + "#DesignVisibility",
  DesignVisibilityField,
);
