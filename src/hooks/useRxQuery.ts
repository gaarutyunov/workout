import { useEffect, useRef, useState } from 'react';
import type { MangoQuery, RxCollection, RxDocument } from 'rxdb';

// Subscribe to a reactive RxDB query and return plain JSON results. The query is
// rebuilt whenever `deps` change (mango selectors are values, so pass them in deps).

export function useRxQuery<T>(
  collection: RxCollection<T> | undefined,
  query: MangoQuery<T> = {},
  deps: unknown[] = [],
): T[] {
  const [docs, setDocs] = useState<T[]>([]);
  // Keep the latest query without retriggering on object identity changes.
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    if (!collection) return;
    const sub = collection.find(queryRef.current).$.subscribe((results) => {
      setDocs((results as RxDocument<T>[]).map((d) => d.toJSON() as T));
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, ...deps]);

  return docs;
}

export function useRxDocument<T>(
  collection: RxCollection<T> | undefined,
  id: string | undefined,
): T | null {
  const [doc, setDoc] = useState<T | null>(null);
  useEffect(() => {
    if (!collection || !id) {
      setDoc(null);
      return;
    }
    const sub = collection.findOne(id).$.subscribe((d) => {
      setDoc(d ? ((d as RxDocument<T>).toJSON() as T) : null);
    });
    return () => sub.unsubscribe();
  }, [collection, id]);
  return doc;
}
