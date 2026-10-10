// App state: the capture, the live pipeline events, and everything the experience view needs.
import { create } from 'zustand';
import { fallbackScene, type PipelineEvent, type Scene, type QuickRead, type Extraction, type Verification, type StageName, type Issue, type ExperienceRecord } from '@living-book/scene';

export type AudioClip = { id: string; url: string; kind: 'opener' | 'narration' | 'line'; text: string; stepId?: string; lineId?: string; speaker?: string; durationMs: number };
export type StageState = { stage: StageName; status: 'start' | 'done' | 'error'; startedAt: number; endedAt?: number; detail?: string; model?: string; ms?: number };
export type Mode = 'ar' | 'photo' | 'flat';

export type ExperienceState = {
  id?: string;
  status: 'idle' | 'capturing' | 'generating' | 'ready' | 'error';
  error?: string;
  pageImageUrl?: string;          // object URL or server URL of the page image (page space)
  page?: { w: number; h: number };
  quickPartial?: Partial<QuickRead>;
  quick?: QuickRead;
  scene?: Scene;
  sceneVersion: number;
  issues: Issue[];
  extraction?: Extraction;
  verification?: Verification;
  audio: AudioClip[];
  assets: Record<string, string>;
  tracking?: { url: string; width: number; height: number; trackPts: number[] };
  stages: StageState[];
  events: PipelineEvent[];
  startedAt: number;
  timings?: Record<string, number>;
  costUsd?: number;
  mode: Mode;
  captionsOn: boolean;
  muted: boolean;
  theatreOpen: boolean;
};

type Actions = {
  reset(): void;
  beginGeneration(pageImageUrl: string, page?: { w: number; h: number }): void;
  applyEvent(e: PipelineEvent): void;
  loadRecord(rec: ExperienceRecord): void;
  setMode(m: Mode): void;
  setCaptions(on: boolean): void;
  setMuted(m: boolean): void;
  setTheatre(open: boolean): void;
  fail(message: string): void;
};

const initial: ExperienceState = {
  status: 'idle', sceneVersion: 0, issues: [], audio: [], assets: {}, stages: [], events: [], startedAt: 0,
  mode: 'flat', captionsOn: true, muted: false, theatreOpen: true,
};

export const useStore = create<ExperienceState & Actions>((set, get) => ({
  ...initial,
  reset: () => set({ ...initial, mode: get().mode, captionsOn: get().captionsOn, muted: get().muted }),
  beginGeneration: (pageImageUrl, page) => set({ ...initial, mode: get().mode, captionsOn: get().captionsOn, muted: get().muted, status: 'generating', pageImageUrl, page, startedAt: performance.now(), theatreOpen: true }),
  fail: (message) => set({ status: 'error', error: message }),
  setMode: (mode) => set({ mode }),
  setCaptions: (captionsOn) => set({ captionsOn }),
  setMuted: (muted) => set({ muted }),
  setTheatre: (theatreOpen) => set({ theatreOpen }),
  applyEvent: (e) => {
    const s = get();
    const events = [...s.events, e];
    switch (e.type) {
      case 'stage': {
        const stages = [...s.stages];
        const i = stages.findIndex((x) => x.stage === e.stage && x.status === 'start');
        if (e.status === 'start') stages.push({ stage: e.stage, status: 'start', startedAt: e.t, detail: e.detail, model: e.model });
        else if (i >= 0) stages[i] = { ...stages[i]!, status: e.status, endedAt: e.t, detail: e.detail ?? stages[i]!.detail, ms: e.ms };
        else stages.push({ stage: e.stage, status: e.status, startedAt: e.t, endedAt: e.t, detail: e.detail, model: e.model, ms: e.ms });
        set({ stages, events });
        break;
      }
      case 'quick-partial': set({ quickPartial: { ...s.quickPartial, ...e.data }, events }); break;
      case 'quick': {
        // awakening: a guaranteed scene built from the quick read alone, shown until the real scene arrives
        const page = s.page && s.page.w === 1000 ? s.page : { w: 1000, h: Math.round(1000 * ((s.page?.h ?? 1414) / (s.page?.w ?? 1000))) };
        const awakening = s.scene ? undefined : fallbackScene({ page, title: e.data.title, figures: e.data.figures.map((f) => f.box), lang: e.data.language, kind: 'summary' });
        set({ quick: e.data, quickPartial: e.data, events, ...(awakening ? { scene: awakening, sceneVersion: 0, page } : {}) });
        break;
      }
      case 'scene': if (e.version >= s.sceneVersion) set({ scene: e.data, sceneVersion: e.version, issues: e.issues, page: e.data.page, events }); else set({ events }); break;
      case 'extraction': set({ extraction: e.data, events }); break;
      case 'verification': set({ verification: e.data, events }); break;
      case 'audio': { const { type, t, ...clip } = e; set({ audio: [...s.audio, clip], events }); break; }
      case 'asset': set({ assets: { ...s.assets, [e.id]: e.url }, events }); break;
      case 'tracking': { const { type, t, ...tr } = e; set({ tracking: tr, events }); break; }
      case 'done': set({ status: 'ready', id: e.experienceId, timings: e.timings, costUsd: e.costUsd, events }); break;
      case 'error': if (!e.recoverable) set({ status: 'error', error: e.message, events }); else set({ events }); break;
    }
  },
  loadRecord: (rec) => set({
    ...initial, mode: get().mode, captionsOn: get().captionsOn, muted: get().muted,
    id: rec.id, status: 'ready', pageImageUrl: rec.page.imageUrl, page: { w: rec.page.w, h: rec.page.h }, quick: rec.quick, quickPartial: rec.quick,
    scene: rec.scene, sceneVersion: 1, extraction: rec.extraction, verification: rec.verification, audio: rec.audio,
    assets: Object.fromEntries(rec.assets.map((a) => [a.id, a.url])), tracking: rec.tracking, timings: rec.timings, costUsd: rec.costUsd, theatreOpen: false,
    stages: Object.entries(rec.timings).filter(([k]) => k !== 'total').map(([stage, ms]) => ({ stage: stage as StageName, status: 'done' as const, startedAt: 0, endedAt: ms, ms })),
  }),
}));
