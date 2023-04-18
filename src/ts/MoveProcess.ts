// Replace moves like a0a1 to a1a2
export function uciCycloneToUCI (from: string, to: string) {
  return {
    from: `${from[0]}${parseInt(from[1]) + 1}`,
    to: `${to[0]}${parseInt(to[1]) + 1}`,
  };
}

// Replace moves like a10b10 to a9a9, a9b9 to a8b8
export function uciToUCICyclone (from: string, to: string) {
  return {
    from: `${from[0]}${parseInt(from.slice(1)) - 1}`,
    to: `${to[0]}${parseInt(to.slice(1)) - 1}`,
  };
}