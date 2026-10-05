import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isApiError } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';

const SAVE_DEBOUNCE_MS = 500;
const RETRY_MS = 2000;

/**
 * The count screen's draft state: optimistic local lines + a debounced,
 * serialized full-state PUT. The draft is created lazily on the first change
 * (idempotent server-side). Fully-empty lines don't exist — mirroring the
 * legacy app, which deleted zeroed localStorage keys.
 */
export function useDraft(sectionId) {
  const queryClient = useQueryClient();
  const showToast = useToast();

  const [linesMap, setLinesMap] = useState(new Map());
  const linesMapRef = useRef(linesMap);
  const draftIdRef = useRef(null);
  const timerRef = useRef(null);
  const queueRef = useRef(Promise.resolve());

  const draftQuery = useQuery({
    queryKey: ['draft', sectionId],
    queryFn: async () => {
      try {
        return await api(`/sections/${sectionId}/draft`);
      } catch (err) {
        if (isApiError(err, 'NO_DRAFT')) return null;
        throw err;
      }
    },
    staleTime: 10_000,
  });

  // Hydrate local state once per draft (not on refetches — local taps win).
  const draftId = draftQuery.data?.id ?? null;
  useEffect(() => {
    if (draftId) {
      draftIdRef.current = draftId;
      setLinesMap(new Map(draftQuery.data.lines.map((l) => [l.itemId, l])));
      linesMapRef.current = linesMap;
    }
  }, [draftId]);

  // Section changed: drop everything belonging to the previous section —
  // lines, pending syncs — so counts never leak across sections.
  useEffect(() => {
    clearTimeout(timerRef.current);
    draftIdRef.current = null;
    setLinesMap(new Map());
    linesMapRef.current = new Map();
  }, [sectionId]);

  const commitLines = useCallback((updater) => {
    setLinesMap((prev) => {
      const next = updater(prev);
      linesMapRef.current = next;
      return next;
    });
    scheduleSave();
  }, [sectionId]);

  async function saveSnapshot() {
    if (!draftIdRef.current) {
      const draft = await api(`/sections/${sectionId}/orders`, { method: 'POST' });
      draftIdRef.current = draft.id;
    }
    const lines = [...linesMapRef.current.values()].map((l) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      needOnly: l.needOnly,
      noStock: l.noStock,
      currentCount: l.currentCount ?? null,
    }));
    await api(`/orders/${draftIdRef.current}/lines`, { method: 'PUT', body: { lines } });
  }

  const flush = useCallback(() => {
    queueRef.current = queueRef.current
      .then(() => saveSnapshot())
      .catch((err) => {
        console.error('Draft sync failed', err);
        showToast('Sync failed — retrying…');
        setTimeout(() => {
          queueRef.current = queueRef.current.then(() => saveSnapshot()).catch(() => {
            /* retried below on next change; keep quiet to avoid toast spam */
          });
        }, RETRY_MS);
      });
     
  }, [sectionId]);

  function scheduleSave() {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  /** Return the draft's id, creating the draft if needed (idempotent server-side). */
  const ensureDraft = useCallback(async () => {
    if (draftIdRef.current) return draftIdRef.current;
    const draft = await api(`/sections/${sectionId}/orders`, { method: 'POST' });
    draftIdRef.current = draft.id;
    return draft.id;
  }, [sectionId]);

  /** Apply a tap to one item line, optimistically. */
  const tap = useCallback((item, mutate) => {
    commitLines((prev) => {
      const next = new Map(prev);
      const current = next.get(item.id) ?? {
        itemId: item.id,
        itemName: item.name,
        categoryName: item.categoryName,
        quantity: 0,
        needOnly: false,
        noStock: false,
        currentCount: null,
      };
      const updated = mutate({ ...current });
      // A line carrying only a stock-mode entry (have-count) still exists.
      if (!updated.quantity && !updated.needOnly && !updated.noStock && !(updated.currentCount > 0)) {
        next.delete(item.id);
      } else {
        next.set(item.id, updated);
      }
      return next;
    });
    if (navigator.vibrate) navigator.vibrate(5);
  }, [commitLines]);

  const clearCategory = useCallback((itemIds) => {
    commitLines((prev) => {
      const next = new Map(prev);
      for (const id of itemIds) next.delete(id);
      return next;
    });
  }, [commitLines]);

  const clearAll = useCallback(() => {
    commitLines(() => new Map());
  }, [commitLines]);

  /** Lines in display order: catalog order first, then anything orphaned. */
  const buildDisplayLines = useCallback((catalog) => {
    const result = [];
    const used = new Set();
    if (catalog) {
      for (const cat of catalog.categories) {
        for (const item of cat.items) {
          const line = linesMapRef.current.get(item.id);
          if (line) {
            result.push(line);
            used.add(item.id);
          }
        }
      }
    }
    for (const [id, line] of linesMapRef.current) {
      if (!used.has(id)) result.push(line);
    }
    return result;
  }, []);

  /** After a successful send: the draft is gone, start clean. */
  const resetAfterSend = useCallback(() => {
    clearTimeout(timerRef.current);
    draftIdRef.current = null;
    setLinesMap(new Map());
    linesMapRef.current = new Map();
    queryClient.invalidateQueries({ queryKey: ['draft', sectionId] });
    queryClient.invalidateQueries({ queryKey: ['receivable', sectionId] });
    queryClient.invalidateQueries({ queryKey: ['orders', sectionId] });
     
  }, [sectionId]);

  const isLoading = draftQuery.isLoading;
  return { linesMap, tap, clearCategory, clearAll, buildDisplayLines, resetAfterSend, ensureDraft, isLoading };
}
