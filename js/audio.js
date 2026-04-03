// ── Simple audio system using Web Audio API (no external files) ──

let ctx = null;

function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
}

function playTone(freq, duration, type = 'square', volume = 0.15) {
    try {
        const c = getCtx();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = volume;
        gain.gain.setTargetAtTime(0, c.currentTime + duration - 0.05, 0.02);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + duration);
    } catch (e) { /* audio not available */ }
}

export const Audio = {
    _lastWarning: 0,
    _lastAltWarning: 0,

    stallWarning() {
        const now = Date.now();
        if (now - this._lastWarning < 800) return;
        this._lastWarning = now;
        playTone(400, 0.15, 'square', 0.12);
        setTimeout(() => playTone(400, 0.15, 'square', 0.12), 200);
    },

    altitudeWarning() {
        const now = Date.now();
        if (now - this._lastAltWarning < 1500) return;
        this._lastAltWarning = now;
        playTone(800, 0.1, 'sine', 0.15);
        setTimeout(() => playTone(1000, 0.1, 'sine', 0.15), 150);
        setTimeout(() => playTone(800, 0.1, 'sine', 0.15), 300);
    },

    groundWarning() {
        const now = Date.now();
        if (now - this._lastWarning < 600) return;
        this._lastWarning = now;
        playTone(600, 0.2, 'sawtooth', 0.1);
    },

    crash() {
        playTone(200, 0.5, 'sawtooth', 0.2);
        setTimeout(() => playTone(100, 0.8, 'sawtooth', 0.15), 300);
    },

    success() {
        playTone(523, 0.15, 'sine', 0.15);
        setTimeout(() => playTone(659, 0.15, 'sine', 0.15), 180);
        setTimeout(() => playTone(784, 0.3, 'sine', 0.15), 360);
    },

    engineFail() {
        playTone(150, 0.3, 'sawtooth', 0.12);
        setTimeout(() => playTone(100, 0.4, 'sawtooth', 0.1), 350);
    }
};
