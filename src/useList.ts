import { useEffect, useState, type KeyboardEvent } from 'react';

export function usePage<T>(items: T[], pageSize: number, filterKey = '', activeIndex?: number) {
  const [selection, setSelection] = useState({ filterKey, activeIndex, page: Math.max(0, Math.floor((activeIndex ?? 0) / pageSize)) });
  const last = Math.max(0, Math.ceil(items.length / pageSize) - 1);
  const changed = selection.filterKey !== filterKey || selection.activeIndex !== activeIndex;
  const page = changed ? Math.min(last, Math.max(0, Math.floor((activeIndex ?? 0) / pageSize))) : Math.min(selection.page, last);
  useEffect(() => {
    if (changed) setSelection({ filterKey, activeIndex, page });
  }, [changed, filterKey, activeIndex, page]);
  return {
    items: items.slice(page * pageSize, (page + 1) * pageSize),
    page,
    pages: last + 1,
    setPage: (next: number) => setSelection({ filterKey, activeIndex, page: Math.max(0, Math.min(next, last)) }),
  };
}

export function arrowFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || !(event.target instanceof HTMLButtonElement)) return;
  const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 :
    event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
  if (!direction && event.key !== 'Home' && event.key !== 'End') return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-list-entry]:not(:disabled)')];
  const index = buttons.indexOf(event.target);
  if (index < 0) return;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + direction + buttons.length) % buttons.length;
  event.preventDefault();
  buttons[next]?.focus();
}
