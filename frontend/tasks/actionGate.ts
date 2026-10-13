/** One operation per context generation. Late completions cannot unlock a newer operation. */
export function createActionGate() {
  let scope = "";
  let generation = 0;
  let pending: object | null = null;
  return {
    setScope(next: string) {
      const invalidatedPending = next !== scope && pending !== null;
      if (next !== scope) {
        scope = next;
        generation++;
        pending = null;
      }
      return invalidatedPending;
    },
    invalidate() { generation++; pending = null; },
    begin() {
      if (pending) return null;
      const token = { generation };
      pending = token;
      return token;
    },
    isCurrent(token: { generation: number }) { return token.generation === generation; },
    finish(token: object) {
      if (pending !== token) return false;
      pending = null;
      return true;
    },
    get busy() { return pending !== null; },
  };
}
