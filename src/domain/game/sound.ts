type SoundName = 'fold'|'check'|'call'|'raise'|'allin'|'deal'|'win'|'champion';

let audio: AudioContext | undefined;

function getAudio() {
  if (!audio) audio = new AudioContext();
  return audio;
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, gain: number, wave: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  const volume = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(frequency, start);
  volume.gain.setValueAtTime(.0001, start);
  volume.gain.exponentialRampToValueAtTime(gain, start + .012);
  volume.gain.exponentialRampToValueAtTime(.0001, start + duration);
  osc.connect(volume);
  volume.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + .02);
}

function tick(ctx: AudioContext, start: number, duration = .045, gain = .025) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const volume = ctx.createGain();
  src.buffer = buffer;
  filter.type = 'highpass';
  filter.frequency.value = 1500;
  volume.gain.setValueAtTime(gain, start);
  volume.gain.exponentialRampToValueAtTime(.0001, start + duration);
  src.connect(filter);
  filter.connect(volume);
  volume.connect(ctx.destination);
  src.start(start);
}

function cheer(ctx: AudioContext, start: number) {
  const duration = 3.2;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const progress = i / data.length;
    const swell = Math.min(1, progress * 10) * Math.min(1, (1 - progress) * 4);
    data[i] = (Math.random() * 2 - 1) * (.22 + swell * .78);
  }
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const volume = ctx.createGain();
  src.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = 780;
  filter.Q.value = .65;
  volume.gain.setValueAtTime(.0001, start);
  volume.gain.linearRampToValueAtTime(.035, start + .18);
  volume.gain.linearRampToValueAtTime(.075, start + 1.05);
  volume.gain.exponentialRampToValueAtTime(.0001, start + duration);
  src.connect(filter);
  filter.connect(volume);
  volume.connect(ctx.destination);
  src.start(start);
  src.stop(start + duration + .02);
}

function scheduleSound(ctx: AudioContext, name: SoundName) {
  const now = ctx.currentTime;
  switch (name) {
    case 'fold':
      tone(ctx, 320, now, .17, .027, 'triangle');
      tone(ctx, 230, now + .08, .18, .018, 'triangle');
      tick(ctx, now, .1, .015);
      break;
    case 'check':
      tone(ctx, 740, now, .08, .018, 'sine');
      break;
    case 'call':
      tone(ctx, 510, now, .1, .026, 'triangle');
      tick(ctx, now, .08, .018);
      break;
    case 'raise':
      tone(ctx, 480, now, .12, .03, 'triangle');
      tone(ctx, 720, now + .08, .17, .032, 'triangle');
      tick(ctx, now, .14, .025);
      break;
    case 'allin':
      tone(ctx, 130, now, .38, .045, 'sawtooth');
      tone(ctx, 390, now + .04, .35, .026, 'triangle');
      tone(ctx, 585, now + .08, .43, .022, 'sine');
      tick(ctx, now, .28, .05);
      break;
    case 'deal':
      tone(ctx, 650, now, .055, .015, 'triangle');
      tone(ctx, 930, now + .04, .075, .014, 'triangle');
      tick(ctx, now, .06, .012);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((hz, i) => tone(ctx, hz, now + i * .12, .32, .042, 'sine'));
      tick(ctx, now + .28, .15, .02);
      break;
    case 'champion':
      cheer(ctx, now);
      [523, 659, 784, 1047, 1319].forEach((hz, i) => tone(ctx, hz, now + i * .14, .55, .045, 'sine'));
      tone(ctx, 784, now + .65, 1.25, .03, 'triangle');
      tone(ctx, 1047, now + 1, 1.5, .03, 'sine');
      tick(ctx, now + .18, .35, .055);
      tick(ctx, now + .85, .35, .045);
      break;
  }
}

export async function playGameSound(name: SoundName, enabled: boolean): Promise<boolean> {
  if (!enabled) return false;
  try {
    const ctx = getAudio();
    if (ctx.state !== 'running') {
      await ctx.resume();
      const resumedState = ctx.state as AudioContextState;
      if (resumedState !== 'running') return false;
    }
    scheduleSound(ctx, name);
    return true;
  } catch {
    // Sound stays optional if Web Audio is unavailable.
    return false;
  }
}
