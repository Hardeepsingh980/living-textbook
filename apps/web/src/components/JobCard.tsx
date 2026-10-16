// A short video or chapter film on the dashboard and in the library: what it is, how far along, and its picture.
import type { Job } from '../lib/types';
import { Link } from '../lib/nav';
import { Icon } from './Icon';
import { GeminiSpark } from './GeminiSpark';

export const KIND_LABEL: Record<Job['kind'], string> = { short: 'Short video', chapter: 'Chapter film', story: 'Story' };
export const active = (j: Job) => j.status === 'queued' || j.status === 'running';

/** How far along a job is, 0..1, from its stage and the counts in its detail line. */
export function jobProgress(j: Job): number {
  if (j.status === 'ready') return 1;
  if (j.status === 'queued') return 0.03;
  const frac = /\((\d+) of (\d+) s\)/.exec(j.detail); const rec = frac ? Number(frac[1]) / Math.max(1, Number(frac[2])) : 0;
  if (j.kind === 'short') return ({ generating: 0.08 + (/Sketching/.test(j.detail) ? 0.1 : /Checking/.test(j.detail) ? 0.2 : /verified/.test(j.detail) ? 0.3 : 0), recording: 0.4 + 0.5 * rec, encoding: 0.95 } as Record<string, number>)[j.stage] ?? 0.05;
  const secs = j.sections ?? [], done = secs.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  return ({ reading: 0.04, choosing: 0.1, making: 0.15 + 0.7 * (secs.length ? done / secs.length : 0) + (secs.some((s) => s.status === 'recording') ? 0.7 / Math.max(1, secs.length) * rec : 0), composing: 0.9 } as Record<string, number>)[j.stage] ?? 0.05;
}
export const jobTitle = (j: Job) => j.title || (j.input.name ? decodeURIComponent(j.input.name).replace(/\.(pdf|jpe?g|png|webp)$/i, '') : KIND_LABEL[j.kind]);

export function JobCard({ job }: { job: Job }) {
  const pct = Math.round(jobProgress(job) * 100);
  const thumb = job.poster || job.sections?.find((s) => s.thumb)?.thumb;
  return (
    <Link to={`/app/jobs/${job.id}`} className={`job-card ${job.status}`}>
      <span className={`job-thumb ${job.kind}`}>{thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon name={job.kind === 'short' ? 'film' : 'doc'} size={34} />}
        {job.status === 'ready' && <span className="play-mark"><Icon name="play" size={20} /></span>}
      </span>
      <span className="job-text">
        <span className="job-kind">{KIND_LABEL[job.kind]}{job.kind === 'chapter' && job.sections?.length ? ` · ${job.sections.length} parts` : ''}{job.seconds ? ` · ${Math.floor(job.seconds / 60)}:${String(job.seconds % 60).padStart(2, '0')}` : ''}</span>
        <b>{jobTitle(job)}</b>
        {active(job) && <><span className="job-detail"><GeminiSpark state="thinking" size={14} /> {job.detail}</span><span className="meter"><span style={{ width: `${pct}%` }} /></span></>}
        {job.status === 'failed' && <span className="job-detail failed">Stopped: {job.error === 'interrupted' ? 'it was interrupted' : 'something went wrong'}</span>}
        {job.status === 'ready' && <span className="job-detail">{new Date(job.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}
      </span>
    </Link>
  );
}
