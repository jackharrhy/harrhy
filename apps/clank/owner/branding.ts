import {
  MAX_LOGO_BASE64_LENGTH,
  MAX_NAME_LENGTH,
  PNG_DATA_URL_PREFIX,
  ThemeBranding,
} from "../../pi/plugins/settings/theme-contract.ts";
import type { Ctx } from "../../pi/src/runtime/chord.ts";

export type Branding = {
  name: string | null;
  logo: string | null;
  tint: number | null;
};

export async function followBranding(
  scope: Ctx,
  publish: (value: Branding | undefined) => Promise<unknown>,
) {
  const ref = await scope.get(ThemeBranding, {}, { readyTimeout: 1000 });
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
    const image = logo.value;
    const title = name.value?.trim();
    const hue = tint.value;
    await publish({
      name: title && title.length <= MAX_NAME_LENGTH ? title : null,
      logo:
        image &&
        image.length <= PNG_DATA_URL_PREFIX.length + MAX_LOGO_BASE64_LENGTH &&
        /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)
          ? image
          : null,
      tint:
        hue !== null && Number.isInteger(hue) && hue >= 0 && hue <= 359
          ? hue
          : null,
    });
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
    await publish(undefined);
  }
}
