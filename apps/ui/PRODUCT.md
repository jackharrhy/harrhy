# UI explorer

An internal workbench for @harrhy/ui, implemented with native Remix 3 on a Node host. No Storybook or second UI framework.

## Explorer

Select a component, change its actual props, inspect native and managed behavior, and copy matching source. Component and theme have shareable query URLs. Search is a native GET form and works without scripts. Mobile exposes component links in a disclosure instead of the desktop rail. Select controls use the actual official Remix UI pattern, not native select elements or a replacement interaction engine.

## Scenes

Keep full compositions separate from individual component controls. Auth consent and Ref board creation are local fixtures, not production screens. Theme comparison preserves each theme's supplied geometry and typography. The Radio scene adapts the actual room presentation and queue/transport behaviors to a synthetic local model, with meaningful scenario controls and keyboard/mobile behavior. No production runtime is imported.

## Boundaries

No real authorization, accounts, persistence, playback, uploads or backend mutations. No production Radio/Auth/Ref cutover. Loopback binding and hostname allowlisting are not authentication. All preview data must be synthetic.

Assumption from the owner's brief: contributors need a practical component explorer and useful complex app previews, not marketing or long explanations.
