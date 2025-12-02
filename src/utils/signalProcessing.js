/**
 * Real-Only Signal Processing for Footstep Detection
 * 
 * PROCESSING PIPELINE:
 * 1. Bandpass filter (12-180 Hz) to isolate footstep frequencies
 * 2. Adaptive normalization using window RMS scaling
 * 3. Rolling MAD noise floor tracking with adaptive threshold
 * 4. Energy-triggered event detection
 * 5. Verification filters to reject noise patterns
 * 
 * Only accepts REAL footstep data - rejects:
 * - Continuous background noise
 * - Rapid repeating spikes (electrical noise)
 * - Random taps (non-footstep patterns)
 */

// ============== CONFIGURATION ==============
export const DETECTION_CONFIG = {
    // === SAMPLE RATE ===
    SAMPLE_RATE: 200,            // Hz

    // === BANDPASS FILTER (12-180 Hz for footsteps) ===
    BANDPASS_LOW_HZ: 12,
    BANDPASS_HIGH_HZ: 180,

    // === ADAPTIVE NORMALIZATION ===
    NORM_WINDOW_MS: 500,         // Window for RMS calculation
    NORM_CLIP_MIN: -1,
    NORM_CLIP_MAX: 1,

    // === NOISE FLOOR TRACKING (Rolling MAD) ===
    NOISE_WINDOW_SAMPLES: 100,   // 500ms at 200Hz
    ADAPTIVE_THRESHOLD_MULT: 2.0, // Signal must be 2.0x MAD to trigger (lowered for sensitivity)
    MIN_NOISE_FLOOR: 0.015,      // Minimum noise floor (normalized, lowered)

    // === ENERGY-TRIGGERED DETECTION ===
    ENERGY_WINDOW_MS: 22,        // ~4 samples at 200Hz
    ENERGY_WINDOW_SAMPLES: 4,    // Precomputed

    // === EVENT SEGMENTATION ===
    PRE_BUFFER_MS: 80,           // Capture before trigger
    POST_BUFFER_MS: 260,         // Capture after trigger
    REFRACTORY_MS: 240,          // Minimum gap between events
    PRE_BUFFER_SAMPLES: 16,      // 80ms at 200Hz
    POST_BUFFER_SAMPLES: 52,     // 260ms at 200Hz
    REFRACTORY_SAMPLES: 48,      // 240ms at 200Hz

    // === VERIFICATION FILTERS ===
    MIN_DURATION_MS: 20,         // Minimum footstep length (lowered)
    MAX_DURATION_MS: 400,        // Maximum footstep length (increased)
    MIN_DURATION_SAMPLES: 4,     // ~20ms at 200Hz
    MAX_DURATION_SAMPLES: 80,    // ~400ms at 200Hz
    MIN_RMS_RAW: 0.01,           // Minimum RMS (normalized, lowered for sensitivity)

    // === SPECTRAL VALIDATION ===
    SPECTRAL_PEAK_LOW_HZ: 20,
    SPECTRAL_PEAK_HIGH_HZ: 120,

    // === NOISE PATTERN REJECTION ===
    MAX_SPIKE_RATE_HZ: 8,        // Reject if >8 spikes/sec (electrical noise)
    MIN_DECAY_RATIO: 0.3,        // Energy must decay to 30% of peak

    // === LIF SMOOTHING ===
    LIF_ALPHA: 0.22,             // Exponential smoothing factor

    // === DISPLAY ===
    GAIN: 50.0,                  // Increased for better visualization
    WARMUP_SAMPLES: 100,         // 500ms warmup

    // === BACKEND FORMAT ===
    TARGET_SAMPLES: 200,         // Resample to 400ms at 200Hz

    // === RAW AMPLITUDE GATE (ADC units) ===
    // Treat |raw-baseline| below this as noise (no trigger). 0 = disabled.
    RAW_DELTA_GATE_ADC: 0
};

// Sensitivity presets
export const SENSITIVITY_PRESETS = {
    low: {
        name: '🔇 Low',
        description: 'Only very strong footsteps',
        ADAPTIVE_THRESHOLD_MULT: 3.5,
        MIN_RMS_RAW: 0.05,
        MIN_DURATION_MS: 30,
        GAIN: 35.0
    },
    medium: {
        name: '🔉 Medium',
        description: 'Balanced (recommended)',
        ADAPTIVE_THRESHOLD_MULT: 2.0,
        MIN_RMS_RAW: 0.02,
        MIN_DURATION_MS: 20,
        GAIN: 50.0
    },
    high: {
        name: '🔊 High',
        description: 'Sensitive - quieter footsteps',
        ADAPTIVE_THRESHOLD_MULT: 1.5,
        MIN_RMS_RAW: 0.012,
        MIN_DURATION_MS: 15,
        GAIN: 65.0
    },
    ultra: {
        name: '📡 Ultra',
        description: 'Maximum - may catch some noise',
        ADAPTIVE_THRESHOLD_MULT: 1.0,
        MIN_RMS_RAW: 0.008,
        MIN_DURATION_MS: 10,
        GAIN: 80.0
    }
};

// ============== MATH UTILITIES ==============

export const mean = (arr) => {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
};

export const std = (arr) => {
    if (!arr || arr.length < 2) return 0;
    const m = mean(arr);
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

export const rms = (arr) => {
    if (!arr || arr.length === 0) return 0;
    const sumSquares = arr.reduce((sum, val) => sum + val * val, 0);
    return Math.sqrt(sumSquares / arr.length);
};

/**
 * Calculate Median Absolute Deviation (MAD) - robust noise estimator
 */
export const mad = (arr) => {
    if (!arr || arr.length === 0) return 0;
    const med = median(arr);
    const absDeviations = arr.map(v => Math.abs(v - med));
    return median(absDeviations) * 1.4826; // Scale to approximate std
};

export const median = (arr) => {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const countZeroCrossings = (arr) => {
    if (!arr || arr.length < 2) return 0;
    let crossings = 0;
    for (let i = 1; i < arr.length; i++) {
        if ((arr[i] >= 0 && arr[i - 1] < 0) || (arr[i] < 0 && arr[i - 1] >= 0)) {
            crossings++;
        }
    }
    return crossings;
};

// ============== SIGNAL PROCESSING ==============

/**
 * Apply Hann window for FFT
 */
export const applyHannWindow = (signal) => {
    const n = signal.length;
    return signal.map((val, i) => {
        const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        return val * window;
    });
};

/**
 * Biquad bandpass filter coefficients
 * Butterworth 2nd order bandpass
 */
const computeBiquadCoeffs = (lowHz, highHz, sampleRate) => {
    const centerFreq = Math.sqrt(lowHz * highHz);
    const bandwidth = highHz - lowHz;
    const Q = centerFreq / bandwidth;
    const w0 = 2 * Math.PI * centerFreq / sampleRate;
    const alpha = Math.sin(w0) / (2 * Q);

    const b0 = alpha;
    const b1 = 0;
    const b2 = -alpha;
    const a0 = 1 + alpha;
    const a1 = -2 * Math.cos(w0);
    const a2 = 1 - alpha;

    return {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0
    };
};

/**
 * Apply bandpass filter (12-180 Hz)
 */
export const bandpassFilter = (signal, config = DETECTION_CONFIG) => {
    const coeffs = computeBiquadCoeffs(
        config.BANDPASS_LOW_HZ,
        config.BANDPASS_HIGH_HZ,
        config.SAMPLE_RATE
    );

    const output = new Array(signal.length).fill(0);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    for (let i = 0; i < signal.length; i++) {
        const x = signal[i];
        const y = coeffs.b0 * x + coeffs.b1 * x1 + coeffs.b2 * x2
            - coeffs.a1 * y1 - coeffs.a2 * y2;

        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        output[i] = y;
    }

    return output;
};

/**
 * Simple high-pass filter to remove DC offset
 */
export const highPassFilter = (signal, alpha = 0.95) => {
    const output = new Array(signal.length).fill(0);
    let prevIn = signal[0];
    let prevOut = 0;

    for (let i = 1; i < signal.length; i++) {
        prevOut = alpha * (prevOut + signal[i] - prevIn);
        prevIn = signal[i];
        output[i] = prevOut;
    }

    return output;
};

/**
 * Compute FFT and return magnitude spectrum
 */
export const computeFFT = (signal, sampleRate = DETECTION_CONFIG.SAMPLE_RATE) => {
    const n = Math.pow(2, Math.ceil(Math.log2(signal.length)));
    const padded = [...signal, ...new Array(n - signal.length).fill(0)];
    const windowed = applyHannWindow(padded);

    const magnitudes = [];
    const frequencies = [];
    const halfN = Math.floor(n / 2);

    for (let k = 0; k < halfN; k++) {
        let realSum = 0;
        let imagSum = 0;

        for (let t = 0; t < n; t++) {
            const angle = 2 * Math.PI * k * t / n;
            realSum += windowed[t] * Math.cos(angle);
            imagSum -= windowed[t] * Math.sin(angle);
        }

        magnitudes.push(Math.sqrt(realSum * realSum + imagSum * imagSum) / n);
        frequencies.push(k * sampleRate / n);
    }

    return { frequencies, magnitudes };
};

/**
 * Find dominant frequency in specified band
 */
export const findDominantFrequency = (frequencies, magnitudes, minFreq = 20, maxFreq = 120) => {
    let maxMag = 0;
    let domFreq = 0;

    for (let i = 0; i < frequencies.length; i++) {
        if (frequencies[i] >= minFreq && frequencies[i] <= maxFreq) {
            if (magnitudes[i] > maxMag) {
                maxMag = magnitudes[i];
                domFreq = frequencies[i];
            }
        }
    }

    return { frequency: domFreq, magnitude: maxMag };
};

/**
 * Calculate energy in frequency band
 */
export const bandEnergy = (frequencies, magnitudes, lowHz, highHz) => {
    let energy = 0;
    for (let i = 0; i < frequencies.length; i++) {
        if (frequencies[i] >= lowHz && frequencies[i] <= highHz) {
            energy += magnitudes[i] * magnitudes[i];
        }
    }
    return Math.sqrt(energy);
};

// ============== LIF NEURON ==============

export class LIFNeuron {
    constructor(tau = 0.020, threshold = 0.025, refractoryPeriod = 0.010, sampleRate = 200) {
        this.tau = tau;
        this.threshold = threshold;
        this.refractoryPeriod = refractoryPeriod;
        this.sampleRate = sampleRate;
        this.dt = 1 / sampleRate;
        this.alpha = DETECTION_CONFIG.LIF_ALPHA;

        this.membrane = 0;
        this.refractoryCount = 0;
        this.spikeHistory = [];
        this.membraneHistory = [];
        this.smoothedInput = 0;
    }

    step(input) {
        const refractorySamples = Math.floor(this.refractoryPeriod * this.sampleRate);

        // Exponential smoothing on input
        this.smoothedInput = this.alpha * Math.abs(input) + (1 - this.alpha) * this.smoothedInput;

        if (this.refractoryCount > 0) {
            this.refractoryCount--;
            this.membrane *= 0.5;
            this.membraneHistory.push(this.membrane);
            return { membrane: this.membrane, spiked: false, smoothedInput: this.smoothedInput };
        }

        const leak = Math.exp(-this.dt / this.tau);
        this.membrane = this.membrane * leak + this.smoothedInput * (1 - leak);

        let spiked = false;
        if (this.membrane >= this.threshold) {
            spiked = true;
            this.spikeHistory.push(Date.now());
            this.membrane = 0;
            this.refractoryCount = refractorySamples;
        }

        this.membraneHistory.push(this.membrane);

        if (this.membraneHistory.length > 500) {
            this.membraneHistory = this.membraneHistory.slice(-500);
        }
        if (this.spikeHistory.length > 100) {
            this.spikeHistory = this.spikeHistory.slice(-100);
        }

        return { membrane: this.membrane, spiked, smoothedInput: this.smoothedInput };
    }

    getSpikeRate(windowMs = 1000) {
        const now = Date.now();
        const recentSpikes = this.spikeHistory.filter(t => now - t < windowMs);
        return (recentSpikes.length / windowMs) * 1000;
    }

    reset() {
        this.membrane = 0;
        this.refractoryCount = 0;
        this.spikeHistory = [];
        this.membraneHistory = [];
        this.smoothedInput = 0;
    }
}

// ============== NOISE PATTERN REJECTION ==============

/**
 * Check if signal is continuous background noise
 */
const isContinuousNoise = (eventBuffer, noiseFloor) => {
    const eventRms = rms(eventBuffer);
    const eventStd = std(eventBuffer);

    // Continuous noise has relatively constant amplitude
    // Real footsteps have sharp attack and decay
    const coeffOfVariation = eventStd / Math.max(Math.abs(mean(eventBuffer)), 0.001);

    // Very lenient check - only reject obvious continuous hum
    return coeffOfVariation < 0.15 && eventRms < noiseFloor * 1.5;
};

/**
 * Check for rapid repeating spikes (electrical noise pattern)
 */
const isRapidRepeatingSpikes = (eventBuffer, config) => {
    // Count local maxima (peaks)
    let peakCount = 0;
    for (let i = 1; i < eventBuffer.length - 1; i++) {
        if (eventBuffer[i] > eventBuffer[i - 1] && eventBuffer[i] > eventBuffer[i + 1]) {
            if (Math.abs(eventBuffer[i]) > rms(eventBuffer) * 1.5) {
                peakCount++;
            }
        }
    }

    const durationSec = eventBuffer.length / config.SAMPLE_RATE;
    const peakRate = peakCount / durationSec;

    // Too many peaks = electrical noise
    return peakRate > config.MAX_SPIKE_RATE_HZ;
};

/**
 * Check for proper energy decay (footstep characteristic)
 */
const hasProperDecay = (eventBuffer, config) => {
    if (eventBuffer.length < 10) return false;

    // Find peak position
    const absBuffer = eventBuffer.map(Math.abs);
    const peakIdx = absBuffer.indexOf(Math.max(...absBuffer));

    // Need samples after peak to check decay
    if (peakIdx >= eventBuffer.length - 5) return true; // Can't check, assume OK

    const peakEnergy = rms(eventBuffer.slice(Math.max(0, peakIdx - 2), peakIdx + 3));
    const tailEnergy = rms(eventBuffer.slice(-10));

    // Energy should decay to less than MIN_DECAY_RATIO of peak
    const decayRatio = tailEnergy / Math.max(peakEnergy, 0.001);

    return decayRatio < config.MIN_DECAY_RATIO;
};

// ============== FOOTSTEP EVENT VALIDATOR ==============

/**
 * Comprehensive footstep validation
 */
export const validateFootstepEvent = (eventBuffer, baselineMean, noiseFloor, config = DETECTION_CONFIG) => {
    const reasons = [];

    // Center the signal
    const centered = eventBuffer.map(v => v - baselineMean);

    // 0. Enforce raw amplitude gate at event level
    const peakAbs = Math.max(...centered.map(Math.abs));
    if (peakAbs < (config.RAW_DELTA_GATE_ADC || 0)) {
        reasons.push(`Below raw amplitude gate: peak ${peakAbs.toFixed(0)} < ${config.RAW_DELTA_GATE_ADC}`);
        return { valid: false, reasons, isNoise: true };
    }

    // 1. Duration check
    const durationSamples = eventBuffer.length;
    if (durationSamples < config.MIN_DURATION_SAMPLES) {
        reasons.push(`Too short: ${durationSamples} < ${config.MIN_DURATION_SAMPLES} samples`);
        return { valid: false, reasons, isNoise: true };
    }
    if (durationSamples > config.MAX_DURATION_SAMPLES) {
        reasons.push(`Too long: ${durationSamples} > ${config.MAX_DURATION_SAMPLES} samples`);
        return { valid: false, reasons, isNoise: true };
    }

    // 2. RMS check (minimum signal strength)
    const eventRms = rms(centered);
    if (eventRms < config.MIN_RMS_RAW) {
        reasons.push(`RMS too low: ${eventRms.toFixed(4)} < ${config.MIN_RMS_RAW}`);
        return { valid: false, reasons, isNoise: true };
    }

    // 3. Check for continuous noise pattern
    if (isContinuousNoise(centered, noiseFloor)) {
        reasons.push('Continuous background noise pattern');
        return { valid: false, reasons, isNoise: true };
    }

    // 4. Check for rapid repeating spikes (electrical noise)
    if (isRapidRepeatingSpikes(centered, config)) {
        reasons.push('Rapid repeating spikes (electrical noise)');
        return { valid: false, reasons, isNoise: true };
    }

    // 5. Check for proper decay (footstep characteristic)
    if (!hasProperDecay(centered, config)) {
        reasons.push('No proper energy decay');
        return { valid: false, reasons, isNoise: true };
    }

    // 6. Spectral validation - check dominant frequency in footstep range
    const { frequencies, magnitudes } = computeFFT(centered, config.SAMPLE_RATE);
    const { frequency: domFreq, magnitude: domMag } = findDominantFrequency(
        frequencies, magnitudes,
        config.SPECTRAL_PEAK_LOW_HZ,
        config.SPECTRAL_PEAK_HIGH_HZ
    );

    // Calculate energy in footstep band vs total
    const footstepBandEnergy = bandEnergy(frequencies, magnitudes, 20, 120);
    const totalEnergy = bandEnergy(frequencies, magnitudes, 0, 200);
    const bandRatio = footstepBandEnergy / Math.max(totalEnergy, 0.001);

    if (bandRatio < 0.1) {
        reasons.push(`Spectral energy outside footstep band: ${(bandRatio * 100).toFixed(0)}%`);
        return { valid: false, reasons, isNoise: true };
    }

    // 7. Peak height check
    const peakDev = Math.max(...centered.map(Math.abs));
    if (peakDev < noiseFloor * config.ADAPTIVE_THRESHOLD_MULT * 0.2) {
        reasons.push(`Peak too low relative to noise: ${peakDev.toFixed(3)} vs threshold ${(noiseFloor * config.ADAPTIVE_THRESHOLD_MULT).toFixed(3)}`);
        return { valid: false, reasons, isNoise: true };
    }

    // PASSED ALL CHECKS - Valid footstep!
    return {
        valid: true,
        isNoise: false,
        metrics: {
            duration_ms: (durationSamples / config.SAMPLE_RATE) * 1000,
            rms: eventRms,
            peakDev,
            domFreq,
            bandRatio,
            samples: durationSamples
        },
        centered,
        frequencies,
        magnitudes
    };
};

// ============== MAIN DETECTOR CLASS ==============

/**
 * Real-Only Footstep Event Detector
 * Energy-triggered with comprehensive noise rejection
 */
export class FootstepEventDetector {
    constructor(config = DETECTION_CONFIG) {
        this.config = { ...DETECTION_CONFIG, ...config };
        this.reset();
    }

    reset() {
        // Baseline tracking
        this.baselineBuffer = [];
        this.baselineMean = 2048; // Default ADC midpoint

        // Noise floor (Rolling MAD)
        this.noiseBuffer = [];
        this.noiseFloor = 0.05;

        // Normalization (Window RMS)
        this.rmsBuffer = [];
        this.currentRms = 1.0;

        // Event state
        this.eventActive = false;
        this.eventBuffer = [];
        this.preBuffer = []; // Circular buffer for pre-trigger samples
        this.postSampleCount = 0;
        this.refractoryCount = 0;

        // Energy tracking
        this.energyBuffer = [];
        this.adaptiveThreshold = 0.1;

        // Stats
        this.warmupCount = 0;
        this.eventsDetected = 0;
        this.noiseEventsRejected = 0;
        this.lastEventTime = 0;

        // Filtered signal
        this.filteredBuffer = [];
        this.filterState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    }

    /**
     * Apply single-sample bandpass filter (maintains state between calls)
     */
    filterSample(raw) {
        const coeffs = computeBiquadCoeffs(
            this.config.BANDPASS_LOW_HZ,
            this.config.BANDPASS_HIGH_HZ,
            this.config.SAMPLE_RATE
        );

        const x = raw - this.baselineMean; // Remove DC offset
        const y = coeffs.b0 * x + coeffs.b1 * this.filterState.x1 + coeffs.b2 * this.filterState.x2
            - coeffs.a1 * this.filterState.y1 - coeffs.a2 * this.filterState.y2;

        this.filterState.x2 = this.filterState.x1;
        this.filterState.x1 = x;
        this.filterState.y2 = this.filterState.y1;
        this.filterState.y1 = y;

        return y;
    }

    /**
     * Update noise floor using Rolling MAD
     */
    updateNoiseFloor(filteredValue) {
        const absVal = Math.abs(filteredValue);

        // Only add quiet samples (below 2x current noise floor)
        if (absVal < this.noiseFloor * 2 || this.noiseBuffer.length < 20) {
            this.noiseBuffer.push(absVal);
            if (this.noiseBuffer.length > this.config.NOISE_WINDOW_SAMPLES) {
                this.noiseBuffer.shift();
            }
        }

        if (this.noiseBuffer.length >= 20) {
            this.noiseFloor = Math.max(
                this.config.MIN_NOISE_FLOOR,
                mad(this.noiseBuffer)
            );
            this.adaptiveThreshold = this.noiseFloor * this.config.ADAPTIVE_THRESHOLD_MULT;
        }
    }

    /**
     * Update baseline (DC offset tracking)
     */
    updateBaseline(raw) {
        this.baselineBuffer.push(raw);
        if (this.baselineBuffer.length > 200) {
            this.baselineBuffer.shift();
        }
        if (this.baselineBuffer.length >= 50) {
            this.baselineMean = mean(this.baselineBuffer);
        }
    }

    /**
     * Update RMS for normalization
     */
    updateRms(filteredValue) {
        this.rmsBuffer.push(filteredValue * filteredValue);
        const windowSamples = Math.floor(this.config.NORM_WINDOW_MS * this.config.SAMPLE_RATE / 1000);
        if (this.rmsBuffer.length > windowSamples) {
            this.rmsBuffer.shift();
        }
        if (this.rmsBuffer.length >= 10) {
            this.currentRms = Math.sqrt(mean(this.rmsBuffer));
        }
    }

    /**
     * Calculate windowed energy for trigger detection
     */
    calculateWindowEnergy(filteredValue) {
        this.energyBuffer.push(filteredValue * filteredValue);
        if (this.energyBuffer.length > this.config.ENERGY_WINDOW_SAMPLES) {
            this.energyBuffer.shift();
        }
        return Math.sqrt(mean(this.energyBuffer));
    }

    /**
     * Normalize value using window RMS
     */
    normalize(value) {
        const normalized = value / Math.max(this.currentRms, 0.001);
        return Math.max(this.config.NORM_CLIP_MIN, Math.min(this.config.NORM_CLIP_MAX, normalized));
    }

    /**
     * Update config
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Process a single raw sample
     */
    processSample(raw) {
        // Warmup phase
        if (this.warmupCount < this.config.WARMUP_SAMPLES) {
            this.updateBaseline(raw);
            const filtered = this.filterSample(raw);
            this.updateNoiseFloor(filtered);
            this.updateRms(filtered);
            this.warmupCount++;

            return {
                event: null,
                raw,
                filtered: 0,
                normalized: 0,
                energy: 0,
                noiseFloor: this.noiseFloor,
                threshold: this.adaptiveThreshold,
                isWarmup: true,
                warmupProgress: this.warmupCount / this.config.WARMUP_SAMPLES
            };
        }

        // Main processing
        const filtered = this.filterSample(raw);
        const energy = this.calculateWindowEnergy(filtered);
        const normalized = this.normalize(filtered);
        const amplified = filtered * this.config.GAIN;

        // Raw amplitude gate (ADC domain) - suppress triggering but keep signal/energy
        const rawDelta = Math.abs(raw - this.baselineMean);
        const gateEnabled = (this.config.RAW_DELTA_GATE_ADC || 0) > 0;
        const belowRawGate = gateEnabled && (rawDelta < this.config.RAW_DELTA_GATE_ADC);

        let detectedEvent = null;

        // Refractory period check
        if (this.refractoryCount > 0) {
            this.refractoryCount--;
            this.updateBaseline(raw);
            this.updateNoiseFloor(filtered);
            this.updateRms(filtered);

            // Still maintain pre-buffer during refractory
            this.preBuffer.push(raw);
            if (this.preBuffer.length > this.config.PRE_BUFFER_SAMPLES) {
                this.preBuffer.shift();
            }

            return {
                event: null,
                raw,
                filtered: amplified,
                normalized,
                energy,
                noiseFloor: this.noiseFloor,
                threshold: this.adaptiveThreshold,
                isWarmup: false,
                eventActive: false,
                inRefractory: true
            };
        }

        // If under raw amplitude gate and not in an active event, treat as quiet noise
        if (!this.eventActive && belowRawGate) {
            // Maintain pre-buffer
            this.preBuffer.push(raw);
            if (this.preBuffer.length > this.config.PRE_BUFFER_SAMPLES) {
                this.preBuffer.shift();
            }

            // Update quiet-time stats
            this.updateBaseline(raw);
            this.updateNoiseFloor(filtered);
            this.updateRms(filtered);

            return {
                event: null,
                raw,
                filtered: 0,
                normalized: 0,
                energy: 0,
                noiseFloor: this.noiseFloor,
                threshold: this.adaptiveThreshold,
                isWarmup: false,
                eventActive: false,
                inRefractory: false,
                gated: true
            };
        }

        if (!this.eventActive) {
            // Maintain pre-buffer
            this.preBuffer.push(raw);
            if (this.preBuffer.length > this.config.PRE_BUFFER_SAMPLES) {
                this.preBuffer.shift();
            }

            // Check for energy trigger
            const triggered = !belowRawGate && (energy > this.adaptiveThreshold);

            if (triggered) {
                // Start event capture
                this.eventActive = true;
                this.eventBuffer = [...this.preBuffer]; // Include pre-buffer
                this.postSampleCount = 0;
                console.log(`🟢 TRIGGER! energy=${energy.toFixed(4)}, threshold=${this.adaptiveThreshold.toFixed(4)}, noise=${this.noiseFloor.toFixed(4)}`);
            } else {
                // Update noise statistics during quiet periods
                this.updateBaseline(raw);
                this.updateNoiseFloor(filtered);
                this.updateRms(filtered);
            }
        } else {
            // Collecting event samples
            this.eventBuffer.push(raw);

            // Check if energy has dropped below threshold (event ending)
            const belowThreshold = energy < this.adaptiveThreshold * 0.5;

            if (belowThreshold) {
                this.postSampleCount++;
            } else {
                this.postSampleCount = 0;
            }

            // End event when we have enough post-buffer or max length reached
            const hasEnoughPost = this.postSampleCount >= this.config.POST_BUFFER_SAMPLES;
            const tooLong = this.eventBuffer.length >= this.config.MAX_DURATION_SAMPLES + this.config.PRE_BUFFER_SAMPLES;

            if (hasEnoughPost || tooLong) {
                detectedEvent = this.finalizeEvent();
            }
        }

        return {
            event: detectedEvent,
            raw,
            filtered: amplified,
            normalized,
            energy,
            noiseFloor: this.noiseFloor,
            threshold: this.adaptiveThreshold,
            isWarmup: false,
            eventActive: this.eventActive,
            eventLength: this.eventBuffer.length,
            inRefractory: false
        };
    }

    /**
     * Finalize and validate event
     */
    finalizeEvent() {
        const eventCopy = [...this.eventBuffer];

        // Reset state
        this.eventActive = false;
        this.eventBuffer = [];
        this.preBuffer = [];
        this.postSampleCount = 0;
        this.refractoryCount = this.config.REFRACTORY_SAMPLES;

        console.log(`🔵 Event captured: ${eventCopy.length} samples`);

        // Validate the event
        const validation = validateFootstepEvent(
            eventCopy,
            this.baselineMean,
            this.noiseFloor,
            this.config
        );

        if (validation.valid) {
            this.eventsDetected++;
            this.lastEventTime = Date.now();
            console.log(`✅ VALID FOOTSTEP:`, validation.metrics);

            return {
                raw: eventCopy,
                centered: validation.centered,
                metrics: validation.metrics,
                frequencies: validation.frequencies,
                magnitudes: validation.magnitudes,
                baselineMean: this.baselineMean,
                noiseFloor: this.noiseFloor,
                timestamp: Date.now(),
                isNoise: false
            };
        } else {
            this.noiseEventsRejected++;
            console.log(`❌ NOISE REJECTED:`, validation.reasons);

            return {
                rejected: true,
                isNoise: true,
                reasons: validation.reasons,
                raw: eventCopy,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Get detector statistics
     */
    getStats() {
        return {
            eventsDetected: this.eventsDetected,
            noiseEventsRejected: this.noiseEventsRejected,
            noiseFloor: this.noiseFloor,
            adaptiveThreshold: this.adaptiveThreshold,
            baselineMean: this.baselineMean,
            isWarmedUp: this.warmupCount >= this.config.WARMUP_SAMPLES
        };
    }

    /**
     * Convert validated event to backend format (200 samples)
     */
    static toBackendFormat(event, targetLength = 200) {
        if (!event || !event.raw || event.isNoise || event.rejected) return null;

        const raw = event.raw;
        const baseline = event.baselineMean || 2048;

        let result;

        if (raw.length > targetLength) {
            // Take center portion around peak
            const absRaw = raw.map(v => Math.abs(v - baseline));
            const peakIdx = absRaw.indexOf(Math.max(...absRaw));
            const start = Math.max(0, peakIdx - Math.floor(targetLength / 2));
            result = raw.slice(start, start + targetLength);

            // If not enough samples, pad
            if (result.length < targetLength) {
                result = raw.slice(0, targetLength);
            }
        } else if (raw.length < targetLength) {
            // Pad with baseline
            const padSize = targetLength - raw.length;
            const leftPad = Math.floor(padSize / 2);
            const rightPad = padSize - leftPad;
            result = [
                ...new Array(leftPad).fill(baseline),
                ...raw,
                ...new Array(rightPad).fill(baseline)
            ];
        } else {
            result = [...raw];
        }

        // Ensure valid ADC range
        return result.map(v => Math.max(0, Math.min(4095, Math.round(v))));
    }
}

// ============== EXPORTS ==============

export default {
    DETECTION_CONFIG,
    SENSITIVITY_PRESETS,
    mean,
    std,
    rms,
    mad,
    median,
    countZeroCrossings,
    applyHannWindow,
    computeFFT,
    findDominantFrequency,
    bandEnergy,
    bandpassFilter,
    highPassFilter,
    validateFootstepEvent,
    LIFNeuron,
    FootstepEventDetector
};
