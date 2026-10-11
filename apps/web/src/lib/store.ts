// App state: the capture, the live pipeline events, and everything the experience view needs. The lifecycle is an
// explicit state machine; nothing is drawn or spoken before the first verified scene has everything it needs.
import { create } from 'zustand';
import type { PipelineEvent, Scene, QuickRead, Extraction, Verification, StageName, Issue, ExperienceRecord } from '@living-book/scene';

export type AudioClip = { id: string; url: string; kind: 'opener' | 'narration' | 'line'; text: string; stepId?: string; lineId?: string; speaker?: string; durationMs: number; version?: number };
export type StageState = { stage: StageName; status: 'start' | 'done' | 'error'; startedAt: number; endedAt?: number; detail?: string; model?: string; ms?: number };
export type Mode = 'ar' | 'photo' | 'flat';
/** idle → capturing → analyzing → generating → validating → preparing → ready → live; failed and cancelled are recoverable. */
export type Phase = 'idle' | 'capturing' | 'analyzing' | 'generating' | 'validating' | 'preparing' | 'ready' | 'live' | 'failed' | 'cancelled';

export type ExperienceState = {
  id?: string;
  status: 'idle' | 'capturing' | 'generating' | 'ready' | 'error';
  phase: Phase;
  error?: string;
  pageImageUrl?: string;          // object URL or server URL of the page image (page space)
  page?: { w: number; h: number };
  quickPartial?: Partial<QuickRead>;
  quick?: QuickRead;
  scene?: Scene;
  sceneVersion: number;
  revealedVersion: number;        // the version the reader is looking at (0 = nothing revealed yet)
  issues: Issue[];
  extraction?: Extraction;
  verification?: Verification;    // latest
  verifications: Record<number, Verification>; // per scene version
  audio: AudioClip[];
  assets: Record<string, string>;
  tracking?: { url: string; width: number; height: number; trackPts: number[] };
  stages: StageState[];
  events: PipelineEvent[];
  startedAt: number;
  timings?: Record<string, number>;
  costUsd?: number;
  mode: Mode;
  pendingScene?: Scene;           // a richer version waiting for the next step boundary
  pendingVersion: number;
  captionsOn: boolean;
  muted: boolean;
  theatreOpen: boolean;
};

type Actions = {
  reset(): void;
  beginGeneration(pageImageUrl: string, page?: { w: number; h: number }): AbortSignal;
  applyEvent(e: PipelineEvent): void;
  loadRecord(rec: ExperienceRecord): void;
  setMode(m: Mode): void;
  setCaptions(on: boolean): void;
  setMuted(m: boolean): void;
  setTheatre(open: boolean): void;
  setPhase(p: Phase): void;
  markRevealed(version: number): void;
  fail(message: string): void;
  applyPendingScene(): void;
};

const initial: ExperienceState = {
  status: 'idle', phase: 'idle', sceneVersion: 0, revealedVersion: 0, issues: [], verifications: {}, audio: [], assets: {}, stages: [], events: [], startedAt: 0,
  mode: 'ar', captionsOn: true, muted: false, theatreOpen: false, pendingScene: undefined, pendingVersion: 0,
};

let generation: AbortController | null = null; // the in-flight request; a new capture or leaving the page aborts it

export const useStore = create<ExperienceState & Actions>((set, get) => ({
  ...initial,
  reset: () => { generation?.abort(); generation = null; set({ ...initial, mode: get().mode, captionsOn: get().captionsOn, muted: get().muted }); },
  beginGeneration: (pageImageUrl, page) => {
    generation?.abort();
    generation = new AbortController();
    set({ ...initial, mode: get().mode, captionsOn: get().captionsOn, muted: get().muted, status: 'generating', phase: 'analyzing', pageImageUrl, page, startedAt: performance.now() });
    return generation.signal;
  },
  fail: (message) => set({ status: 'error', phase: 'failed', error: message }),
  setMode: (mode) => set({ mode }),
  setCaptions: (captionsOn) => set({ captionsOn }),
  setMuted: (muted) => set({ muted }),
  setTheatre: (theatreOpen) => set({ theatreOpen }),
  setPhase: (phase) => set({ phase }),
  markRevealed: (version) => set((s) => ({ revealedVersion: Math.max(s.revealedVersion, version), phase: s.phase === 'live' ? 'live' : 'ready' })),
  applyPendingScene: () => { const s = get(); if (s.pendingScene) set({ scene: s.pendingScene, sceneVersion: s.pendingVersion, pendingScene: undefined, pendingVersion: 0, page: s.pendingScene.page }); },
  applyEvent: (e) => {
    const s = get();
    const events = [...s.events, e];
    const before = s.phase;
    const advance = (to: Phase, from: Phase[]) => (from.includes(before) ? { phase: to } : {});
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
      case 'quick': set({ quick: e.data, quickPartial: e.data, events, ...advance('generating', ['analyzing']) }); break;
      case 'scene': {
        // the first version is held by the view until it is validated; later versions wait for a step boundary
        if (e.version <= 1 || s.sceneVersion < 1) { if (e.version >= s.sceneVersion) set({ scene: e.data, sceneVersion: e.version, issues: e.issues, page: e.data.page, events, pendingScene: undefined, pendingVersion: 0, ...advance('validating', ['analyzing', 'generating']) }); else set({ events }); }
        else if (e.version > s.sceneVersion && e.version >= s.pendingVersion) set({ pendingScene: e.data, pendingVersion: e.version, events });
        else set({ events });
        break;
      }
      case 'extraction': set({ extraction: e.data, events }); break;
      case 'verification': {
        const version = e.version ?? Math.max(1, s.sceneVersion);
        set({ verification: e.data, verifications: { ...s.verifications, [version]: e.data }, events, ...(version === 1 ? advance('preparing', ['analyzing', 'generating', 'validating']) : {}) });
        break;
      }
      case 'audio': { const { type, t, ...clip } = e; set({ audio: [...s.audio.filter((a) => a.id !== clip.id), clip], events }); break; }
      case 'asset': set({ assets: { ...s.assets, [e.id]: e.url }, events }); break;
      case 'tracking': { const { type, t, ...tr } = e; set({ tracking: tr, events }); break; }
      case 'ready': set({ status: 'ready', id: e.experienceId, events }); break;
      case 'done': set({ status: 'ready', id: e.experienceId, timings: e.timings, costUsd: e.costUsd, events }); break;
      case 'error': if (!e.recoverable) set({ status: 'error', phase: 'failed', error: e.message, events }); else set({ events }); break;
    }
  },
  loadRecord: (rec) => set({
    ...initial, mode: get().mode, captionsOn: get().captionsOn, muted: get().muted,
    id: rec.id, status: 'ready', phase: 'preparing', pageImageUrl: rec.page.imageUrl, page: { w: rec.page.w, h: rec.page.h }, quick: rec.quick, quickPartial: rec.quick,
    scene: rec.scene, sceneVersion: rec.sceneVersion ?? 1, extraction: rec.extraction, verification: rec.verification, verifications: rec.verification ? { [rec.sceneVersion ?? 1]: rec.verification } : {},
    audio: rec.audio, assets: Object.fromEntries(rec.assets.map((a) => [a.id, a.url])), tracking: rec.tracking, timings: rec.timings, costUsd: rec.costUsd, theatreOpen: false,
    stages: Object.entries(rec.timings).filter(([k]) => k !== 'total').map(([stage, ms]) => ({ stage: stage as StageName, status: 'done' as const, startedAt: 0, endedAt: ms, ms })),
  }),
}));
