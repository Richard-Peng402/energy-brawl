export function appendPresentationEvent<T>(events: T[], event: T, capacity: number): void {
  events.push(event);
  const overflow = events.length - capacity;
  if (overflow > 0) events.splice(0, overflow);
}
