import { average } from "./utils/mathUtil";

const VISEMES = {
  sil: "viseme_sil",
  PP: "viseme_PP",
  FF: "viseme_FF",
  TH: "viseme_TH",
  DD: "viseme_DD",
  kk: "viseme_kk",
  CH: "viseme_CH",
  SS: "viseme_SS",
  nn: "viseme_nn",
  RR: "viseme_RR",
  aa: "viseme_aa",
  E: "viseme_E",
  I: "viseme_I",
  O: "viseme_O",
  U: "viseme_U",
};

export class Lipsync {
  constructor({
    debug = false,
    fftSize = 2048,
    historySize = 10,
    canvas = null,
  }) {
    this.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.history = [];
    this.historySize = historySize;
    this.debug = debug;
    this.prevViseme = VISEMES.sil;
    this.smoothingFactor = 0.7; // For viseme transition smoothing

    this.frequencyBins = this.analyser.frequencyBinCount;
    this.sampleRate = this.audioContext.sampleRate; // e.g., 44100 Hz
    this.binWidth = this.sampleRate / fftSize; // e.g., ~21.5 Hz per bin

    // Define frequency bands (in Hz)
    this.bands = [
      { start: 50, end: 200 }, // Band 1: Low energy
      { start: 200, end: 400 }, // Band 2: F1 lower
      { start: 400, end: 800 }, // Band 3: F1 mid
      { start: 800, end: 1500 }, // Band 4: F2 front
      { start: 1500, end: 2500 }, // Band 5: F2/F3
      { start: 2500, end: 4000 }, // Band 6: Fricatives
      { start: 4000, end: 8000 }, // Band 7: High fricatives
    ];

    this.visemeRules = {
      [VISEMES.sil]: (f) => (f.volume < 0.1 ? 1 : 0),
      [VISEMES.PP]: (f) =>
        f.deltaBands[0] > 0.5 && f.bands[0] > f.bands[3] ? 0.9 : 0,
      [VISEMES.SS]: (f) => (f.bands[6] > 0.6 || f.centroid > 4000 ? 0.5 : 0),
      [VISEMES.O]: (f) =>
        f.bands[2] > f.bands[0] && f.bands[2] > f.bands[4] ? 0.6 : 0,
      [VISEMES.I]: (f) =>
        f.bands[4] > f.bands[2] && f.centroid > 2000 ? 0.7 : 0,
      [VISEMES.U]: (f) =>
        f.bands[1] > f.bands[3] && f.centroid < 1500 ? 0.6 : 0,
      [VISEMES.aa]: (f) =>
        f.bands[2] > f.bands[4] && f.bands[2] > f.bands[1] ? 0.7 : 0,
      [VISEMES.FF]: (f) => (f.bands[6] > 0.5 && f.centroid < 3500 ? 0.8 : 0),
      [VISEMES.TH]: (f) => (f.bands[5] > 0.4 && f.bands[6] > 0.3 ? 0.7 : 0),
      [VISEMES.DD]: (f) =>
        f.deltaBands[2] > 0.4 && f.bands[2] > f.bands[4] ? 0.8 : 0,
      // Add rules for FF, TH, DD, etc., based on phonetic characteristics
    };
    // Canvas setup
    this.canvas = canvas;
    this.canvasCtx = canvas ? canvas.getContext("2d") : null;
    if (this.canvas) {
      this.canvas.width = 400;
      this.canvas.height = 200;
    }

    if (this.debug) {
      this.setupDebugPanel();
    }
  }

  setupDebugPanel() {
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "fixed",
      top: "0",
      right: "0",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      color: "white",
      padding: "10px",
      zIndex: "9999",
      fontFamily: "monospace",
      fontSize: "12px",
      whiteSpace: "pre-wrap",
    });
    document.body.appendChild(panel);
    this.debugPanel = panel;
  }

  connectAudio(audio) {
    const source = this.audioContext.createMediaElementSource(audio);
    source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
  }

  // Connect live microphone
  async connectMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      return source;
    } catch (err) {
      console.error("Error accessing microphone:", err);
      throw err;
    }
  }

  extractFeatures() {
    this.analyser.getByteFrequencyData(this.dataArray);

    // Convert frequency ranges to bin indices
    const bandEnergies = this.bands.map(({ start, end }) => {
      const startBin = Math.floor(start / this.binWidth);
      const endBin = Math.min(
        Math.floor(end / this.binWidth),
        this.dataArray.length - 1
      );
      return average(this.dataArray.slice(startBin, endBin)) / 255;
    });

    // Compute spectral centroid
    let sumAmplitude = 0;
    let weightedSum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const freq = i * this.binWidth;
      const amp = this.dataArray[i] / 255;
      sumAmplitude += amp;
      weightedSum += freq * amp;
    }
    const centroid = sumAmplitude > 0 ? weightedSum / sumAmplitude : 0;

    // Compute volume
    const volume = average(bandEnergies);

    // Compute deltas
    const prev = this.history[this.history.length - 1] || {
      bands: new Array(this.bands.length).fill(0),
      centroid: 0,
    };
    const deltaBands = bandEnergies.map((energy, i) => energy - prev.bands[i]);

    const features = {
      bands: bandEnergies,
      deltaBands,
      volume,
      centroid,
    };

    // Update history
    this.history.push(features);
    if (this.history.length > this.historySize) {
      this.history.shift();
    }

    return features;
  }

  classifyViseme(features) {
    const scores = Object.keys(this.visemeRules).map((viseme) => ({
      viseme,
      score: this.visemeRules[viseme](features),
    }));

    const { viseme } = scores.reduce(
      (max, curr) => (curr.score > max.score ? curr : max),
      { viseme: VISEMES.sil, score: 0 }
    );

    if (viseme !== this.prevViseme && features.volume < 0.1) {
      return this.prevViseme;
    }
    this.prevViseme = viseme;
    return viseme;
  }

  drawVisualization(features, viseme) {
    if (!this.canvasCtx) return;

    const ctx = this.canvasCtx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const barWidth = width / this.bands.length;
    const maxCentroid = 8000; // Max frequency to display

    // Clear canvas
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);

    // Draw frequency bands
    features.bands.forEach((energy, i) => {
      const barHeight = energy * height;
      ctx.fillStyle = `hsl(${i * (360 / this.bands.length)}, 70%, 50%)`;
      ctx.fillRect(i * barWidth, height - barHeight, barWidth - 2, barHeight);
    });

    // Draw centroid
    const centroidX = (features.centroid / maxCentroid) * width;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centroidX, 0);
    ctx.lineTo(centroidX, height);
    ctx.stroke();

    // Draw viseme and volume
    ctx.fillStyle = "white";
    ctx.font = "14px monospace";
    ctx.fillText(`Viseme: ${viseme}`, 10, 20);
    ctx.fillText(`Volume: ${(features.volume * 255).toFixed(1)}`, 10, 40);
  }

  getViseme() {
    const features = this.extractFeatures();
    const viseme = this.classifyViseme(features);

    // Draw visualization
    this.drawVisualization(features, viseme);

    if (this.debug) {
      this.debugPanel.innerHTML = `
        <strong>Viseme: ${viseme}</strong>
        <br>Bands: ${features.bands
          .map((b, i) => `B${i + 1}: ${(b * 255).toFixed(1)}`)
          .join(", ")}
        <br>Volume: ${(features.volume * 255).toFixed(1)}
        <br>Centroid: ${features.centroid.toFixed(0)} Hz
        <br>History: ${this.history.length}
      `;
    }

    return viseme;
  }

  // For Three.js integration
  getVisemeBlendWeights() {
    const features = this.extractFeatures();
    const viseme = this.classifyViseme(features);
    this.drawVisualization(features, viseme); // Draw during blend weights too
    const weights = Object.fromEntries(
      Object.keys(VISEMES).map((key) => [VISEMES[key], 0])
    );
    weights[viseme] = 1; // Full weight to selected viseme
    return weights;
  }
}

export default Lipsync;
