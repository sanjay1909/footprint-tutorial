export interface ScopeDiff {
  added: Set<string>;
  mutated: Set<string>;
}

export function diffScopeStates(
  current: Record<string, unknown>,
  previous: Record<string, unknown>,
  prefix = '',
): ScopeDiff {
  const added = new Set<string>();
  const mutated = new Set<string>();

  for (const key of Object.keys(current)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!(key in previous)) {
      added.add(path);
    } else if (typeof current[key] === 'object' && current[key] !== null &&
               typeof previous[key] === 'object' && previous[key] !== null &&
               !Array.isArray(current[key])) {
      const nested = diffScopeStates(
        current[key] as Record<string, unknown>,
        previous[key] as Record<string, unknown>,
        path,
      );
      nested.added.forEach(p => added.add(p));
      nested.mutated.forEach(p => mutated.add(p));
    } else if (JSON.stringify(current[key]) !== JSON.stringify(previous[key])) {
      mutated.add(path);
    }
  }

  return { added, mutated };
}
