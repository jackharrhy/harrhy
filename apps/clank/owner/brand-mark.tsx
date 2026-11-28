import { css, type Handle } from "remix/component";

export function BrandMark(handle: Handle<{ logo?: string | null }>) {
  return () =>
    handle.props.logo ? (
      <img
        alt=""
        width="20"
        height="20"
        src={handle.props.logo}
        mix={css({ objectFit: "contain" })}
      />
    ) : (
      <svg
        width="20"
        height="20"
        aria-hidden="true"
        viewBox="0 0 4 4"
        shape-rendering="crispEdges"
      >
        <rect x="0" y="0" width="3" height="1" fill="rgb(228 138 122)" />
        <rect x="2" y="1" width="1" height="1" fill="rgb(228 138 122)" />
        <rect x="0" y="1" width="1" height="3" fill="rgb(79 142 179)" />
        <rect x="1" y="2" width="1" height="1" fill="rgb(79 142 179)" />
        <rect x="3" y="2" width="1" height="2" fill="rgb(234 182 93)" />
      </svg>
    );
}
