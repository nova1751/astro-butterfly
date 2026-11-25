// Media time is authoritative. Wake at the next line instead of waiting for timeupdate.
export function bindLyricClock(
  audio: HTMLAudioElement,
  cues: () => readonly (readonly [number, string])[],
  update: () => void,
) {
  const listeners = new AbortController();
  let timer: number | undefined;
  let target: number | undefined;

  function cancel() {
    window.clearTimeout(timer);
    timer = undefined;
    target = undefined;
  }

  function schedule() {
    if (audio.paused || audio.seeking || audio.ended || audio.readyState < 3 ||
        audio.playbackRate <= 0 || document.hidden) {
      cancel();
      return;
    }
    const lines = cues();
    const time = audio.currentTime;
    let low = 0;
    let high = lines.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (lines[mid]![0] <= time) low = mid + 1;
      else high = mid;
    }
    const next = lines[low]?.[0];
    if (next === target) return;
    cancel();
    if (typeof next !== 'number' || !Number.isFinite(next)) return;
    target = next;
    timer = window.setTimeout(() => {
      target = undefined;
      if (audio.currentTime >= next) update();
      schedule();
    }, Math.max(12, (next - time) * 1000 / audio.playbackRate));
  }

  function resync() {
    cancel();
    update();
    schedule();
  }

  const options = { signal: listeners.signal };
  for (const event of ['playing', 'ratechange', 'seeked']) audio.addEventListener(event, resync, options);
  for (const event of ['waiting', 'pause', 'emptied', 'seeking', 'ended']) audio.addEventListener(event, cancel, options);
  audio.addEventListener('timeupdate', schedule, options);
  document.addEventListener('visibilitychange', resync, options);
  schedule();
  return () => { cancel(); listeners.abort(); };
}
