/** Shared layout classes for consistent responsive behavior across the app. */

export const appShellClass = "min-h-dvh w-full max-w-[100vw] overflow-x-clip";

/** Horizontal padding aligned with the dashboard header (full-width shell). */
export const pageEdgePaddingClass = "px-4 sm:px-5 md:px-6 lg:px-8 xl:px-10";

export const pageMainClass = `w-full min-w-0 py-5 sm:py-6 md:py-8 ${pageEdgePaddingClass}`;

/** Fluid content width — no fixed max-width column (avoids large side gaps on wide screens). */
export const pageContainerClass = "w-full min-w-0";

/** PDF + side panel (send, template, signing, document editor). */
export const builderSplitGridClass =
  "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_min(100%,min(320px,100%))] lg:items-start";

export const builderSidePanelClass =
  "min-w-0 space-y-2 lg:max-h-[min(70dvh,calc(100dvh-10rem))] lg:overflow-y-auto lg:overscroll-contain";

/** Dashboard table + activity sidebar. */
export const dashboardMainGridClass =
  "grid min-w-0 gap-5 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,22rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,24rem)]";
