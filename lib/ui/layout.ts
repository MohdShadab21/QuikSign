/** Shared layout classes for consistent responsive behavior across the app. */

export const appShellClass = "min-h-dvh w-full max-w-[100vw] overflow-x-clip";

export const pageMainClass = "w-full min-w-0 px-4 py-5 sm:py-6 md:px-6 md:py-8";

export const pageContainerClass = "mx-auto w-full min-w-0 max-w-7xl";

/** PDF + side panel (send, template, signing, document editor). */
export const builderSplitGridClass =
  "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_min(100%,min(320px,100%))] lg:items-start";

export const builderSidePanelClass =
  "min-w-0 space-y-2 lg:max-h-[min(70dvh,calc(100dvh-10rem))] lg:overflow-y-auto lg:overscroll-contain";
