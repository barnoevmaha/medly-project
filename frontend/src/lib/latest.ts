import { useRef } from "react";

/**
 * Drop responses to requests that have since been superseded.
 *
 * A search box fires a request per pause in typing, and responses can arrive
 * in any order: the slow one for "card" can land after the fast one for
 * "cardio" and overwrite it, leaving results that match nothing on screen.
 * Call `begin()` when a request starts; the function it returns says whether
 * that request is still the newest by the time its response arrives.
 */
export function createLatestGuard() {
  let newest = 0;
  return function begin(): () => boolean {
    const mine = ++newest;
    return () => mine === newest;
  };
}

/** `createLatestGuard`, kept for the lifetime of a component. */
export function useLatestGuard() {
  const guard = useRef<ReturnType<typeof createLatestGuard>>();
  if (!guard.current) guard.current = createLatestGuard();
  return guard.current;
}
