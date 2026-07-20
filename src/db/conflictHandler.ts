import type { RxConflictHandler } from 'rxdb';

// §5: last-write-wins per document, keyed by `updatedAt`, ties broken by `deviceId`.
// Because each workout/exercise/meal is its own document, true conflicts are rare —
// you'd have to edit the *same* entry on two offline devices. No CRDT needed.
//
// SPEC.md shows the older RxDB object form { isEqual, resolve }; RxDB 15 ships the
// conflict handler as a function returning { isEqual: true } | { isEqual: false,
// documentData }. The LWW policy is identical.

export type ConflictDoc = {
  updatedAt?: string;
  deviceId?: string;
  _deleted?: boolean;
};

/** Pick the last-write-wins winner of two document states (also used by the
 *  Dropbox conflicted-copy reconciliation pass in §5). */
export function lww<T extends ConflictDoc>(a: T, b: T): T {
  const au = a.updatedAt ?? '';
  const bu = b.updatedAt ?? '';
  if (au !== bu) return au > bu ? a : b;
  // tie on updatedAt → break deterministically by deviceId
  return (a.deviceId ?? '') >= (b.deviceId ?? '') ? a : b;
}

export const lwwConflictHandler: RxConflictHandler<any> = async (input) => {
  const { newDocumentState, realMasterState } = input;
  if (
    newDocumentState.updatedAt === realMasterState.updatedAt &&
    newDocumentState._deleted === realMasterState._deleted
  ) {
    return { isEqual: true };
  }
  return { isEqual: false, documentData: lww(newDocumentState, realMasterState) };
};
