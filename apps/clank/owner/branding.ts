import {
  MAX_LOGO_BASE64_LENGTH,
  MAX_NAME_LENGTH,
  PNG_DATA_URL_PREFIX,
  ThemeBranding,
} from "../../pi/plugins/settings/theme-contract.ts";
import type { Ctx, Ref } from "../../pi/src/runtime/chord.ts";

export type Branding = {
  name: string | null;
  logo: string | null;
  tint: number | null;
};

function validatedBranding(
  name: string | null,
  logo: string | null,
  tint: number | null,
): Branding {
  const title = name?.trim();
  return {
    name: title && title.length <= MAX_NAME_LENGTH ? title : null,
    logo:
      logo &&
      logo.length <= PNG_DATA_URL_PREFIX.length + MAX_LOGO_BASE64_LENGTH &&
      /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)
        ? logo
        : null,
    tint:
      tint !== null && Number.isInteger(tint) && tint >= 0 && tint <= 359
        ? tint
        : null,
  };
}

const getBranding = (scope: Ctx) =>
  scope.get(ThemeBranding, {}, { readyTimeout: 1000 });

// Start the optional hold now. Settling the root scope releases even a pending get.
export function startSnapshotBranding(scope: Ctx): () => Branding | undefined {
  let ref: Ref<typeof ThemeBranding> | undefined;
  void getBranding(scope).then(
    (ready) => {
      ref = ready;
    },
    () => {},
  );
  return () => {
    try {
      if (ref?.variant === "owner" && ref.state.value.kind === "live")
        return validatedBranding(
          ref.name.value,
          ref.logo.value,
          ref.tint.value,
        );
    } catch {
      // A failed member must not cost the page its catalog.
    }
  };
}

export async function followBranding(
  scope: Ctx,
  publish: (value: Branding) => Promise<unknown>,
) {
  const ref = await getBranding(scope);
  if (ref.variant !== "owner") return;
  const [binding, name, logo, tint] = await Promise.all([
    ref.state.watch(scope),
    ref.name.watch(scope),
    ref.logo.watch(scope),
    ref.tint.watch(scope),
  ]);
  const watches = [binding, name, logo, tint] as const;
  const live = () => ref.variant === "owner" && ref.state.value.kind === "live";
  let ended = false;
  const stop = () => {
    ended = true;
    return binding.stop();
  };
  const send = async () => {
    if (ended || !live()) {
      await stop();
      return;
    }
    await publish(validatedBranding(name.value, logo.value, tint.value));
  };
  try {
    binding.start(async (call) => {
      if (call.kind !== "value" || call.value.kind !== "live") await stop();
    });
    for (const watch of [name, logo, tint]) {
      watch.start(async (call) => {
        if (call.kind !== "value" || call.retired) await stop();
        else await send();
      });
    }
    await send();
    await Promise.race(watches.map((watch) => watch.closed));
  } finally {
    ended = true;
    await Promise.all(watches.map((watch) => watch.stop()));
  }
}
