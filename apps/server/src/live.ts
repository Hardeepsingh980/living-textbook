// Voice Q&A: a WebSocket proxy between the browser and the Gemini Live API. The service-account credentials
// stay on the server; the browser sends 16 kHz PCM and receives 24 kHz PCM plus transcripts.
//
// Client → server JSON messages: {type:'start', experienceId, state?}, {type:'audio', data:<base64 pcm16 16k>},
//   {type:'text', text}, {type:'state', state:{...slider values}}, {type:'end'}
// Server → client: {type:'ready'}, {type:'audio', data:<base64 pcm16 24k>}, {type:'transcript', role:'user'|'model', text, final},
//   {type:'turnComplete'}, {type:'interrupted'}, {type:'error', message}, {type:'closed'}
import type { WebSocket } from 'ws';
import { Modality, type LiveServerMessage, type Session } from '@google/genai';
import { clients } from './gemini.js';
import { config } from './config.js';
import { store } from './store.js';
import { SceneRuntime, type ExperienceRecord } from '@living-book/scene';

function systemInstruction(rec: ExperienceRecord): string {
  const ex = rec.extraction;
  const sc = rec.scene;
  const facts = ex ? JSON.stringify({ headings: ex.headings, values: ex.values, worked: ex.worked, equations: ex.equations, entities: ex.entities, setting: ex.setting, dialogue: ex.dialogue, steps: ex.steps, claims: ex.claims }) : '';
  const vars = sc.vars.map((v) => `${v.id} (${v.label ?? v.id}, ${v.unit ?? 'no unit'}, ${v.min}..${v.max})`).join(', ');
  const derived = sc.derived.map((d) => `${d.id} = ${d.expr}${d.unit ? ` [${d.unit}]` : ''}`).join('; ');
  return `You are the voice of Living Book, a friendly tutor who has just brought a book page to life on the reader's phone.
Speak the page's language (${rec.quick.language}). Keep answers short (one to three sentences), warm, concrete and child-safe. Ask a short follow-up question when it helps learning.
Ground every answer in THE PAGE and in the CURRENT STATE of the experience. If a question goes beyond what the page supports, say so briefly and offer what the page does say.
Before answering anything about values, settings or "what if", call get_current_state to read the live slider values and compute from the scene's formulas.

THE PAGE (${rec.quick.subject}; title "${rec.quick.title}"):
${ex ? ex.text.slice(0, 6000) : rec.quick.gist}

STRUCTURED FACTS: ${facts.slice(0, 4000)}

THE EXPERIENCE: kind ${sc.kind}; variables: ${vars || 'none'}; formulas: ${derived || 'none'}; steps: ${sc.steps.map((s) => s.title ?? s.id).join(' → ') || 'none'}.`;
}

export async function handleLiveSocket(ws: WebSocket) {
  const { liveAi } = await clients();
  let session: Session | null = null;
  let currentState: Record<string, number> = {};
  let closed = false;
  const send = (m: object) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };

  const start = async (experienceId: string, state?: Record<string, number>) => {
    const rec = await store.getRecord(experienceId);
    if (!rec) { send({ type: 'error', message: 'experience not found' }); return; }
    if (state) currentState = state;
    const sys = systemInstruction(rec);
    const handle = (m: LiveServerMessage) => {
          if (process.env.LIVE_DEBUG) console.log('[live] <-', JSON.stringify(m).slice(0, 300));
          const sc = m.serverContent;
          if (sc?.modelTurn?.parts) for (const p of sc.modelTurn.parts) if (p.inlineData?.data) send({ type: 'audio', data: p.inlineData.data });
          if (sc?.inputTranscription?.text) send({ type: 'transcript', role: 'user', text: sc.inputTranscription.text, final: !!(sc as any).inputTranscription?.finished });
          if (sc?.outputTranscription?.text) send({ type: 'transcript', role: 'model', text: sc.outputTranscription.text, final: !!(sc as any).outputTranscription?.finished });
          if (sc?.interrupted) send({ type: 'interrupted' });
          if (sc?.turnComplete) send({ type: 'turnComplete' });
          if (m.toolCall?.functionCalls?.length) {
            const responses = m.toolCall.functionCalls.map((fc) => ({ id: fc.id, name: fc.name, response: { result: { state: currentState, derived: deriveValues(rec, currentState) } } }));
            console.log('[live] tool call', m.toolCall.functionCalls.map((f) => f.name).join(','), '->', JSON.stringify(responses[0]?.response).slice(0, 200));
            session?.sendToolResponse({ functionResponses: responses });
          }
    };
    session = await liveAi.live.connect({
      model: config.models.live.id,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: sys,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voices.narrator[rec.quick.language as 'en' | 'hi'] ?? 'Kore' } } },
        tools: [{ functionDeclarations: [{ name: 'get_current_state', description: 'Read the current values of the experience variables (slider positions, time) and the derived values computed from them.', parameters: { type: 'OBJECT', properties: {} } }] }],
      } as any,
      callbacks: {
        onopen: () => { /* ready is sent once the session object exists */ },
        onmessage: (m: LiveServerMessage) => {
          try { handle(m); } catch (e: any) { console.error('[live] onmessage', e); send({ type: 'error', message: String(e?.message || e) }); }
        },
        onerror: (e: any) => { console.error('[live] error', e?.message || e); send({ type: 'error', message: String(e?.message || e) }); },
        onclose: (e: any) => { console.log('[live] closed', e?.reason || ''); send({ type: 'closed', reason: e?.reason }); if (!closed) ws.close(); },
      },
    });
  };

  const queue: any[] = [];
  const dispatch = (m: any) => {
    if (!session) { if (m.type !== 'audio') queue.push(m); return; } // audio before the session exists is dropped; text/state wait
    if (m.type === 'audio' && typeof m.data === 'string') session.sendRealtimeInput({ audio: { data: m.data, mimeType: 'audio/pcm;rate=16000' } });
    else if (m.type === 'text' && typeof m.text === 'string') session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: m.text }] }], turnComplete: true });
    else if (m.type === 'state' && m.state) currentState = m.state;
    else if (m.type === 'end') { session.close(); session = null; }
  };
  ws.on('message', async (raw) => {
    let m: any;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    try {
      if (m.type === 'start') { await start(String(m.experienceId), m.state); send({ type: 'ready' }); while (queue.length) dispatch(queue.shift()); }
      else dispatch(m);
    } catch (e: any) { console.error('[live] dispatch', e?.message || e); send({ type: 'error', message: String(e?.message || e) }); }
  });
  ws.on('close', () => { closed = true; try { session?.close(); } catch { /* ok */ } session = null; });
}

/** Evaluate the scene's derived values for the given variable assignment (same engine as the renderer). */
function deriveValues(rec: ExperienceRecord, state: Record<string, number>) {
  try { return new SceneRuntime(rec.scene).evaluateWith(state); } catch { return {}; }
}
