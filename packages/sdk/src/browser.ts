// The script-tag build: <script src="https://<living-textbook>/sdk/v1.js" data-key="ltpk_..."></script>
// It defines window.LivingTextbook(options) → { lesson(), scanner() }, and mounts these by themselves:
//   <div data-lt-lesson="LESSON_ID" data-lt-height="640"></div>        a lesson player
//   <button data-lt-scanner>Scan a page</button>                         opens the scanner; the button then receives a
//                                                                        "livingtextbook:lesson" event with the lesson
import { createEmbed, type EmbedOptions } from './embed.js';
import { VERSION } from './constants.js';

const script = (typeof document !== 'undefined' ? document.currentScript : null) as HTMLScriptElement | null;
const scriptHost = script?.src ? new URL(script.src).origin : undefined;
const scriptKey = script?.dataset.key;

function LivingTextbook(options: EmbedOptions = {}) {
  return createEmbed({ host: scriptHost, publishableKey: scriptKey, ...options });
}
LivingTextbook.version = VERSION;

function mount(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-lt-lesson]').forEach((el) => {
    if (el.dataset.ltMounted) return;
    el.dataset.ltMounted = '1';
    const player = LivingTextbook({ publishableKey: el.dataset.ltKey || scriptKey }).lesson(el, { lessonId: el.dataset.ltLesson!, height: el.dataset.ltHeight });
    player.on('*', (e) => el.dispatchEvent(new CustomEvent(`livingtextbook:${e.type}`, { detail: e, bubbles: true })));
  });
  root.querySelectorAll<HTMLElement>('[data-lt-scanner]').forEach((el) => {
    if (el.dataset.ltMounted) return;
    el.dataset.ltMounted = '1';
    el.addEventListener('click', () => {
      LivingTextbook({ publishableKey: el.dataset.ltKey || scriptKey }).scanner({
        onLesson: (lesson) => el.dispatchEvent(new CustomEvent('livingtextbook:lesson', { detail: lesson, bubbles: true })),
        onClose: () => el.dispatchEvent(new CustomEvent('livingtextbook:close', { bubbles: true })),
      });
    });
  });
}
(LivingTextbook as any).mount = mount;

if (typeof window !== 'undefined') {
  (window as any).LivingTextbook = LivingTextbook;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount());
  else mount();
}
