/**
 * Noise-Robust Signal Processing Utilities for Footstep Detection
 * Matches the Python reference implementation with smart validation
 */

// Detection Constants - EXTREMELY sensitive, almost no filtering
export const DETECTION_CONFIG = {
    THRESHOLD_MULT: 0.15,     // 80% lower - extremely sensitive
    MIN_SAMPLES: 5,           // Very short events allowed
    MAX_SAMPLES: 1000,        // Allow longer events
    IDLE_TIMEOUT: 15,         // Quick event end detection
    MIN_PEAK_DEVIATION: 1.0,  // Almost any peak detected
    MIN_SIGNAL_STD: 0.5,      // Extremely low std threshold
    MIN_ENERGY: 10.0,         // Almost no energy requirement
    MIN_SNR: 0.05,            // Almost no SNR requirement
    MIN_PEAK_RATIO: 1.01,     // Almost any peak ratio
    MIN_DOMINANT_FREQ: 1.0,   // Hz - very low minimum frequency
    MAX_DOMINANT_FREQ: 150.0, // Hz - high maximum frequency
    BP_LOW: 1,                // Very wide bandpass
    BP_HIGH: 150,             // Very wide bandpass
    FILTER_ORDER: 2,          // Lighter filtering
    GAIN: 20.0,               // Maximum signal amplification
    BASELINE_BUFFER_SIZE: 100,// Smaller baseline buffer for faster response
    WARMUP_THRESHOLD: 20,     // Very fast warmup
    SAMPLE_RATE: 200,         // Hz
};

// Sensitivity presets - much wider range for testing
export const SENSITIVITY_PRESETS = {
    low: {
        name: 'Low (Strict)',
        THRESHOLD_MULT: 0.5,
        MIN_PEAK_DEVIATION: 10.0,
        MIN_SNR: 0.3,
        MIN_ENERGY: 200.0
    },
    medium: {
        name: 'Medium (Balanced)',
        THRESHOLD_MULT: 0.2,
        MIN_PEAK_DEVIATION: 3.0,
        MIN_SNR: 0.1,
        MIN_ENERGY: 30.0
    },
    high: {
        name: 'High (Ultra Sensitive)',
        THRESHOLD_MULT: 0.05,
        MIN_PEAK_DEVIATION: 0.5,
        MIN_SNR: 0.01,
        MIN_ENERGY: 5.0
    },
    extreme: {
        name: 'Extreme (No Filter)',
        THRESHOLD_MULT: 0.01,
        MIN_PEAK_DEVIATION: 0.1,
        MIN_SNR: 0.001,
        MIN_ENERGY: 1.0
    }
};

/**
 * Calculate mean of array
 */
export const mean = (arr) => {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
};

/**
 * Calculate standard deviation of array
 */
export const std = (arr) => {
    if (!arr || arr.length < 2) return 0;
    const m = mean(arr);
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

/**
 * Calculate RMS (Root Mean Square) of array
 */
export const rms = (arr) => {
    if (!arr || arr.length === 0) return 0;
    const sumSquares = arr.reduce((sum, val) => sum + val * val, 0);
    return Math.sqrt(sumSquares / arr.length);
};

/**
 * Count zero crossings in signal
 */
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

/**
 * Apply Hann window to signal
 */
export const applyHannWindow = (signal) => {
    const n = signal.length;
    return signal.map((val, i) => {
        const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        return val * window;
    });
};

/**
 * Simple FFT implementation (Cooley-Tukey radix-2)
 * Returns magnitude spectrum
 */
export const computeFFT = (signal, sampleRate = DETECTION_CONFIG.SAMPLE_RATE) => {
    // Pad to nearest power of 2
    const n = Math.pow(2, Math.ceil(Math.log2(signal.length)));
    const padded = [...signal, ...new Array(n - signal.length).fill(0)];

    // Apply window
    const windowed = applyHannWindow(padded);

    // Simple DFT for small arrays (more accurate for our use case)
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
 * Find dominant frequency in FFT result
 */
export const findDominantFrequency = (frequencies, magnitudes, minFreq = 5, maxFreq = 100) => {
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
 * Simple bandpass filter using moving average approximation
 * (Full Butterworth would require more complex implementation)
 */
export const bandpassFilter = (signal, lowHz, highHz, sampleRate = DETECTION_CONFIG.SAMPLE_RATE) => {
    // Use FFT-based filtering
    const { frequencies, magnitudes } = computeFFT(signal, sampleRate);

    // For now, return signal as-is with frequency info
    // In production, implement proper IIR filter
    const filtered = signal.map((val, i) => {
        // Simple high-pass approximation
        if (i === 0) return 0;
        return val - signal[i - 1] * 0.1;
    });

    return filtered;
};

/**
 * Validate a footstep event using all noise-rejection criteria
 */
export const validateFootstepEvent = (eventBuffer, baselineMean, baselineStd) => {
    const config = DETECTION_CONFIG;
    const reasons = [];

    // 1. Length check
    if (eventBuffer.length < config.MIN_SAMPLES) {
        reasons.push(`Too short: ${eventBuffer.length} < ${config.MIN_SAMPLES}`);
        return { valid: false, reasons };
    }

    // 2. Peak deviation check
    const peakDev = Math.max(...eventBuffer.map(v => Math.abs(v - baselineMean)));
    if (peakDev < config.MIN_PEAK_DEVIATION) {
        reasons.push(`Peak deviation too low: ${peakDev.toFixed(1)} < ${config.MIN_PEAK_DEVIATION}`);
        return { valid: false, reasons };
    }

    // 3. SNR check
    const snr = peakDev / Math.max(baselineStd, 1);
    if (snr < config.MIN_SNR) {
        reasons.push(`SNR too low: ${snr.toFixed(2)} < ${config.MIN_SNR}`);
        return { valid: false, reasons };
    }

    // 4. Signal std check
    const sigStd = std(eventBuffer);
    if (sigStd < config.MIN_SIGNAL_STD) {
        reasons.push(`Signal std too low: ${sigStd.toFixed(2)} < ${config.MIN_SIGNAL_STD}`);
        return { valid: false, reasons };
    }

    // 5. Center the signal
    const eventMean = mean(eventBuffer);
    const centered = eventBuffer.map(v => v - eventMean);

    // 6. Peak ratio check
    const peakVal = Math.max(...centered.map(Math.abs));
    const meanAbs = mean(centered.map(Math.abs));
    const peakRatio = peakVal / Math.max(meanAbs, 0.001);
    if (peakRatio < config.MIN_PEAK_RATIO) {
        reasons.push(`Peak ratio too low: ${peakRatio.toFixed(2)} < ${config.MIN_PEAK_RATIO}`);
        return { valid: false, reasons };
    }

    // 7. Energy check
    const energy = centered.reduce((sum, v) => sum + v * v, 0);
    if (energy < config.MIN_ENERGY) {
        reasons.push(`Energy too low: ${energy.toFixed(0)} < ${config.MIN_ENERGY}`);
        return { valid: false, reasons };
    }

    // 8. Zero crossings check
    const zeroCrossings = countZeroCrossings(centered);
    const minZc = Math.max(5, Math.floor(eventBuffer.length / 40));
    if (zeroCrossings < minZc) {
        reasons.push(`Zero crossings too low: ${zeroCrossings} < ${minZc}`);
        return { valid: false, reasons };
    }

    // 9. Dominant frequency check
    const { frequencies, magnitudes } = computeFFT(centered, config.SAMPLE_RATE);
    const { frequency: domFreq } = findDominantFrequency(frequencies, magnitudes, 5, 100);

    if (domFreq < config.MIN_DOMINANT_FREQ || domFreq > config.MAX_DOMINANT_FREQ) {
        reasons.push(`Dominant freq out of range: ${domFreq.toFixed(1)} Hz not in [${config.MIN_DOMINANT_FREQ}, ${config.MAX_DOMINANT_FREQ}]`);
        return { valid: false, reasons };
    }

    return {
        valid: true,
        metrics: {
            peakDev,
            snr,
            sigStd,
            peakRatio,
            energy,
            zeroCrossings,
            domFreq,
            length: eventBuffer.length
        },
        centered,
        frequencies,
        magnitudes
    };
};

/**
 * LIF (Leaky Integrate-and-Fire) Neuron Model
 */
export class LIFNeuron {
    constructor(tau = 0.020, threshold = 0.025, refractoryPeriod = 0.010, sampleRate = 200) {
        this.tau = tau;                    // Membrane time constant (seconds)
        this.threshold = threshold;        // Spike threshold
        this.refractoryPeriod = refractoryPeriod; // Refractory period (seconds)
        this.sampleRate = sampleRate;
        this.dt = 1 / sampleRate;          // Time step

        this.membrane = 0;                 // Membrane potential
        this.refractoryCount = 0;          // Refractory counter
        this.spikeHistory = [];            // Recent spikes
        this.membraneHistory = [];         // Membrane potential history
    }

    /**
     * Process a single input sample
     * @param {number} input - Normalized input (0-1 range ideally)
     * @returns {{membrane: number, spiked: boolean}}
     */
    step(input) {
        const refractorySamples = Math.floor(this.refractoryPeriod * this.sampleRate);

        // Refractory period
        if (this.refractoryCount > 0) {
            this.refractoryCount--;
            this.membrane *= 0.5; // Rapid decay during refractory
            this.membraneHistory.push(this.membrane);
            return { membrane: this.membrane, spiked: false };
        }

        // Leaky integration
        const leak = Math.exp(-this.dt / this.tau);
        this.membrane = this.membrane * leak + Math.abs(input) * (1 - leak);

        // Check threshold
        let spiked = false;
        if (this.membrane >= this.threshold) {
            spiked = true;
            this.spikeHistory.push(Date.now());
            this.membrane = 0; // Reset
            this.refractoryCount = refractorySamples;
        }

        this.membraneHistory.push(this.membrane);

        // Keep history bounded
        if (this.membraneHistory.length > 500) {
            this.membraneHistory = this.membraneHistory.slice(-500);
        }
        if (this.spikeHistory.length > 100) {
            this.spikeHistory = this.spikeHistory.slice(-100);
        }

        return { membrane: this.membrane, spiked };
    }

    /**
     * Get spike rate in Hz
     */
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
    }
}

/**
 * Noise-Robust Event Detector Class
 */
export class FootstepEventDetector {
    constructor(config = DETECTION_CONFIG) {
        this.config = config;
        this.reset();
    }

    reset() {
        this.baselineBuffer = [];
        this.baselineMean = null;
        this.baselineStd = 5.0;
        this.warmupCount = 0;
        this.eventActive = false;
        this.eventBuffer = [];
        this.idleCount = 0;
        this.lastEventTime = 0;
        this.eventsDetected = 0;
    }

    /**
     * Update baseline statistics
     */
    updateBaseline(raw) {
        this.baselineBuffer.push(raw);
        if (this.baselineBuffer.length > this.config.BASELINE_BUFFER_SIZE) {
            this.baselineBuffer.shift();
        }

        if (this.baselineBuffer.length >= 50) {
            this.baselineMean = mean(this.baselineBuffer);
            this.baselineStd = Math.max(5.0, std(this.baselineBuffer));
        }
    }

    /**
     * Calculate dynamic threshold - extremely low floor for testing
     */
    getThreshold() {
        // Floor of 0.5 instead of 5.0 for maximum sensitivity
        return Math.max(0.5, this.baselineStd * this.config.THRESHOLD_MULT);
    }

    /**
     * Update config with new values (for sensitivity adjustment)
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Process a single raw sample
     * @param {number} raw - Raw ADC value (0-4095)
     * @returns {{event: number[]|null, amplified: number, deviation: number, threshold: number}}
     */
    processSample(raw) {
        // Warmup phase
        if (this.warmupCount < this.config.WARMUP_THRESHOLD) {
            this.updateBaseline(raw);
            this.warmupCount++;
            return {
                event: null,
                amplified: 0,
                deviation: 0,
                threshold: this.getThreshold(),
                isWarmup: true
            };
        }

        // Ensure baseline is set
        if (this.baselineMean === null) {
            this.updateBaseline(raw);
            return {
                event: null,
                amplified: 0,
                deviation: 0,
                threshold: this.getThreshold(),
                isWarmup: true
            };
        }

        const deviation = Math.abs(raw - this.baselineMean);
        const threshold = this.getThreshold();
        const amplified = (raw - this.baselineMean) * this.config.GAIN;

        let detectedEvent = null;

        if (deviation > threshold) {
            // Potential event activity
            if (!this.eventActive && deviation > threshold * 1.2) {
                // Start new event
                this.eventActive = true;
                this.eventBuffer = [raw];
                this.idleCount = 0;
            } else if (this.eventActive) {
                // Continue event
                this.eventBuffer.push(raw);
                this.idleCount = 0;
            }
        } else if (this.eventActive) {
            // Below threshold during active event
            this.eventBuffer.push(raw);
            this.idleCount++;

            // Check for event end
            if (this.idleCount > this.config.IDLE_TIMEOUT ||
                this.eventBuffer.length > this.config.MAX_SAMPLES) {
                // Finalize event
                detectedEvent = this.finalizeEvent();
            }
        } else {
            // No active event, update baseline
            this.updateBaseline(raw);
        }

        return {
            event: detectedEvent,
            amplified,
            deviation,
            threshold,
            isWarmup: false,
            eventActive: this.eventActive,
            eventLength: this.eventBuffer.length
        };
    }

    /**
     * Finalize and validate current event
     */
    finalizeEvent() {
        const eventCopy = [...this.eventBuffer];

        // Reset event state
        this.eventActive = false;
        this.eventBuffer = [];
        this.idleCount = 0;

        // Validate the event
        const validation = validateFootstepEvent(eventCopy, this.baselineMean, this.baselineStd);

        if (validation.valid) {
            this.eventsDetected++;
            this.lastEventTime = Date.now();
            return {
                raw: eventCopy,
                centered: validation.centered,
                metrics: validation.metrics,
                frequencies: validation.frequencies,
                magnitudes: validation.magnitudes,
                baselineMean: this.baselineMean,
                timestamp: Date.now()
            };
        }

        return null;
    }

    /**
     * Convert validated event to backend format (200 samples)
     */
    static toBackendFormat(event, targetLength = 200) {
        if (!event || !event.raw) return null;

        const raw = event.raw;
        const baseline = event.baselineMean || 2048;

        let result;

        if (raw.length > targetLength) {
            // Take center portion
            const start = Math.floor((raw.length - targetLength) / 2);
            result = raw.slice(start, start + targetLength);
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

        // Ensure all values are valid integers in ADC range
        return result.map(v => Math.max(0, Math.min(4095, Math.round(v))));
    }
}

export default {
    DETECTION_CONFIG,
    mean,
    std,
    rms,
    countZeroCrossings,
    applyHannWindow,
    computeFFT,
    findDominantFrequency,
    bandpassFilter,
    validateFootstepEvent,
    LIFNeuron,
    FootstepEventDetector
};
