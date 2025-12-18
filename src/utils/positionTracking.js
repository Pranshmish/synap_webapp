/**
 * Advanced TDOA (Time-Difference-of-Arrival) Position Tracker
 * 
 * This tracker uses a window-based approach to detect the EXACT moment of impact 
 * on each sensor, then uses the wave propagation speed in plywood to triangulate 
 * the (x, y) coordinates.
 */
class PositionTracker {
    constructor(width, height) {
        this.width = width || 47;
        this.height = height || 65;

        // Sensor Coordinates (cm)
        // P0: Bottom-Left (0, 0)
        // P1: Top-Left (0, 65) 
        // P2: Bottom-Right (47, 0)
        // P3: Top-Right (47, 65)
        this.sensors = [
            { id: 0, x: 0, y: 0, name: "P0" },
            { id: 1, x: 0, y: this.height, name: "P1" },
            { id: 2, x: this.width, y: 0, name: "P2" },
            { id: 3, x: this.width, y: this.height, name: "P3" }
        ];

        // Parameters
        this.waveSpeed = 35000; // Default: 350 m/s (approx for plywood)
        this.sampleRate = 1000; // Hz
        this.toaThresholdRatio = 0.15; // Trigger TOA at 15% of peak

        this.positionHistory = [];
        this.baselines = [0, 0, 0, 0];
        this.calibrationPoints = [];

        // HARD GATE STATE - supports per-channel filtering
        this.hardGates = [75, 75, 75, 75];

        this.sharpeningExponent = 3.5;
        this.lastCalcTime = 0;
    }

    setThreshold(val) {
        if (Array.isArray(val)) {
            this.hardGates = [...val];
        } else {
            this.hardGates = [val, val, val, val];
        }
    }

    setSharpening(val) { this.sharpeningExponent = val; }

    setWaveSpeed(speed) { this.waveSpeed = speed; }
    setCalibrationData(points) { this.calibrationPoints = points || []; }
    getSensors() { return this.sensors; }

    /**
     * Extracts TOA (Time of Arrival) for each channel using the first window of data.
     * Uses sub-sample interpolation for higher precision at 1kHz.
     */
    extractTOAs(channelWindows) {
        const toas = [0, 0, 0, 0];

        for (let i = 0; i < 4; i++) {
            const buffer = channelWindows[i];
            const peak = Math.max(...buffer.map(Math.abs));
            const threshold = peak * this.toaThresholdRatio;

            let foundIdx = -1;
            for (let t = 1; t < buffer.length; t++) {
                if (Math.abs(buffer[t]) >= threshold) {
                    // Sub-sample interpolation:
                    // t_actual = t_prev + (threshold - val_prev) / (val_now - val_prev)
                    const valPrev = Math.abs(buffer[t - 1]);
                    const valNow = Math.abs(buffer[t]);
                    const fraction = (valNow === valPrev) ? 0 : (threshold - valPrev) / (valNow - valPrev);
                    toas[i] = (t - 1) + Math.max(0, Math.min(1, fraction));
                    foundIdx = t;
                    break;
                }
            }

            if (foundIdx === -1) toas[i] = buffer.length; // Max delay if not found
        }
        return toas;
    }

    /**
     * TDOA Solver using Grid Search (Maximum Robustness for small boards)
     */
    solveTDOA(toas) {
        const earliest = Math.min(...toas);
        const actualDeltas = toas.map(t => (t - earliest) * (1000 / this.sampleRate)); // ms

        let bestX = this.width / 2;
        let bestY = this.height / 2;
        let minResidual = Infinity;

        // Resolution: 1cm for the grid search
        for (let x = 0; x <= this.width; x += 1) {
            for (let y = 0; y <= this.height; y += 1) {
                // Calculate distances to all sensors
                const dists = this.sensors.map(s => Math.sqrt(Math.pow(x - s.x, 2) + Math.pow(y - s.y, 2)));
                const dEarliest = Math.min(...dists);

                // Expected TDOAs in ms: (deltaDistance / waveSpeed) * 1000
                // waveSpeed is in cm/s
                const expectedDeltas = dists.map(d => ((d - dEarliest) / this.waveSpeed) * 1000);

                let residual = 0;
                for (let i = 0; i < 4; i++) {
                    residual += Math.pow(expectedDeltas[i] - actualDeltas[i], 2);
                }

                if (residual < minResidual) {
                    minResidual = residual;
                    bestX = x;
                    bestY = y;
                }
            }
        }

        return { x: bestX, y: bestY, residual: minResidual };
    }

    /**
     * Main calculation entry point.
     * @param {Array<Array<number>>} windows - 4 arrays of raw ADC samples (window of 200ms)
     */
    calculatePosition(windows) {
        if (!windows || windows.length !== 4) return null;

        // 1. Estimate TOAs
        const toas = this.extractTOAs(windows);

        // 2. Solve via TDOA Grid Search
        const result = this.solveTDOA(toas);

        // 3. Compute Confidence (Residual based)
        // High residual = poor triangulation fit
        const confidence = Math.max(0, Math.min(10, 10 - (result.residual * 5)));

        // 4. Temporal Smoothing (EMA)
        if (confidence > 3) {
            if (!this.emaPosition) {
                this.emaPosition = { x: result.x, y: result.y };
            } else {
                this.emaPosition.x = this.emaPosition.x * (1 - this.smoothingFactor) + result.x * this.smoothingFactor;
                this.emaPosition.y = this.emaPosition.y * (1 - this.smoothingFactor) + result.y * this.smoothingFactor;
            }
        }

        const out = {
            x: Math.round((this.emaPosition?.x || result.x) * 10) / 10,
            y: Math.round((this.emaPosition?.y || result.y) * 10) / 10,
            confidence: Math.round(confidence * 10) / 10,
            rawTOA: toas,
            isFingerprint: false,
            timestamp: Date.now()
        };

        return out;
    }

    /**
     * For backward compatibility with manual mapping triggers
     */
    calculateFromAmps(amplitudes) {
        // Fallback or legacy support
        return null;
    }
}

export default PositionTracker;
export { PositionTracker };
