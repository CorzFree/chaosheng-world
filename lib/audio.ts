import type { Weather } from './world';
export class SeaAudio {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  rain: GainNode | null = null;
  nodes: AudioNode[] = [];
  enabled = false;
  async start() {
    if (!this.context) {
      const C = window.AudioContext;
      if (!C) throw new Error('当前浏览器暂时不能播放海声。');
      const c = new C();
      this.context = c;
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.master.connect(c.destination);
      const buffer = c.createBuffer(1, c.sampleRate * 6, c.sampleRate),
        data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + Math.random() * 0.04 - 0.02) / 1.02;
        data[i] = last * 3;
      }
      const noise = c.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      const waves = c.createGain();
      waves.gain.value = 0.42;
      noise.connect(filter);
      filter.connect(waves);
      waves.connect(this.master);
      noise.start();
      const lfo = c.createOscillator(),
        lg = c.createGain();
      lfo.frequency.value = 0.09;
      lg.gain.value = 0.14;
      lfo.connect(lg);
      lg.connect(waves.gain);
      lfo.start();
      const rb = c.createBuffer(1, c.sampleRate * 3, c.sampleRate),
        rd = rb.getChannelData(0);
      for (let i = 0; i < rd.length; i++)
        rd[i] = (Math.random() * 2 - 1) * 0.35;
      const rain = c.createBufferSource();
      rain.buffer = rb;
      rain.loop = true;
      const rf = c.createBiquadFilter();
      rf.type = 'lowpass';
      rf.frequency.value = 2800;
      this.rain = c.createGain();
      this.rain.gain.value = 0;
      rain.connect(rf);
      rf.connect(this.rain);
      this.rain.connect(this.master);
      rain.start();
      this.nodes = [noise, filter, waves, lfo, lg, rain, rf, this.rain];
    }
    await this.context.resume();
    this.enabled = true;
    this.master!.gain.setTargetAtTime(0.45, this.context.currentTime, 0.5);
  }
  async stop() {
    this.enabled = false;
    if (this.context) {
      this.master!.gain.setTargetAtTime(0, this.context.currentTime, 0.15);
      await this.context.suspend();
    }
  }
  weather(w: Weather) {
    if (this.context && this.rain)
      this.rain.gain.setTargetAtTime(
        w === 'rain' ? 0.5 : w === 'mist' ? 0.06 : 0,
        this.context.currentTime,
        1.2,
      );
  }
  chime(index = 0) {
    if (!this.context || !this.enabled) return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = 'sine';
    o.frequency.value = [261.63, 293.66, 329.63, 392, 440][Math.abs(index) % 5];
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.07, c.currentTime + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.3);
    o.connect(g);
    g.connect(this.master!);
    o.start();
    o.stop(c.currentTime + 1.4);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  destroy() {
    this.nodes.forEach((n) => n.disconnect());
    void this.context?.close();
    this.context = null;
    this.enabled = false;
  }
}
