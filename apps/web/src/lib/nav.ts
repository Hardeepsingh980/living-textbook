// One way to move around the app: push (or replace) the URL and tell the router. Views link with <Link>.
import { createElement, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export function navigate(url: string, replace = false) {
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  window.dispatchEvent(new Event('lb:navigate'));
  document.querySelector('.app-main')?.scrollTo?.(0, 0);
}

/** An ordinary link (so it can be opened in a new tab) that navigates in place on a plain click. */
export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return createElement('a', {
    href: to, ...rest,
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); navigate(to);
    },
  });
}
