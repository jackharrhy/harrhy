import { css } from "remix/component";

// sRGB samples of the original app.css OKLCH ramp, verified in its live browser.
export const originalBlue = {
  300: "#397ce1",
  400: "#2b70df",
  500: "#2165da",
  600: "#1d56bf",
  700: "#1948a5",
  800: "#153a8a",
  900: "#112d70",
} as const;

// Original html background: 7rem tiles, half-tile stagger, 2.5% white circles.
// The original #bg-gradient masks the pattern through the top 70dvh.
export const originalBackdrop = css({
  backgroundColor: originalBlue[600],
  backgroundImage: `linear-gradient(${originalBlue[600]}, transparent), radial-gradient(circle, rgb(255 255 255 / .025) 40%, transparent 21%), radial-gradient(circle, rgb(255 255 255 / .025) 40%, transparent 21%)`,
  backgroundSize: "100% 70dvh, 112px 112px, 112px 112px",
  backgroundPosition: "0 0, 0 0, 56px 56px",
  backgroundRepeat: "no-repeat, repeat, repeat",
});
