import { PositionTracker } from './src/utils/positionTracking.js';

console.log("---------------------------------------------------");
console.log("       SYNAPSENSE POSITION TRACKING - DIAGNOSTIC REPORT");
console.log("---------------------------------------------------");

const tracker = new PositionTracker(80, 60);

// ==========================================
// TEST 1: INITIALIZATION
// ==========================================
console.log("[TEST 1] System Initialization");
if (tracker.width === 80 && tracker.height === 60) {
    console.log("   STATUS: PASS (Grid: 80x60cm)");
} else {
    console.log("   STATUS: FAIL");
}

// ==========================================
// TEST 2: HARDWARE FAULT SIMULATION (The "Stuck Sensor" Bug)
// ==========================================
console.log("\n[TEST 2] Stuck Sensor Rejection (P2 biased at 2048)");
// Simulate calibration
const baselines = [0, 0, 2048, 0];
tracker.calibrate(baselines);
console.log("   ACTION: Calibrated Baselines -> [0, 0, 2048, 0]");

// Simulate IDLE state (P2 is stuck at 2048, others near 0)
// Input: [10, 5, 2055, 2]
// Delta: [10, 5, 7, 2] (All < Gate)
const noisyInput = [10, 5, 2055, 2];
const res1 = tracker.calculatePosition(noisyInput);

if (res1 === null) {
    console.log("   RESULT: NULL (Correctly Ignored)");
    console.log("   STATUS: PASS - Oscillation prevented.");
} else {
    console.log("   RESULT: TRACKED:", res1);
    console.log("   STATUS: FAIL - Phantom step detected!");
}

// ==========================================
// TEST 3: VALID STEP DETECTION
// ==========================================
console.log("\n[TEST 3] Valid Step (Top-Left Impact)");
// Input: P0=3000 (Strong), P2=2048 (Stuck), others low
// Delta: P0=3000, P2=0
const stepInput = [3000, 200, 2048, 50];
const res2 = tracker.calculatePosition(stepInput);

if (res2 && res2.x < 10 && res2.y < 10) {
    console.log(`   RESULT: Position (x:${res2.x.toFixed(1)}, y:${res2.y.toFixed(1)})`);
    console.log("   STATUS: PASS - Correctly mapped to Top-Left.");
} else {
    console.log("   RESULT:", res2);
    console.log("   STATUS: FAIL");
}

// ==========================================
// TEST 4: HARD GATE LOGIC
// ==========================================
console.log("\n[TEST 4] Hard Gate Thresholding");
tracker.setThreshold(2000); // Set Gate to 2000
console.log("   ACTION: Set Raw Gate to 2000");

// Input: All sensors at 1500 (Medium vibration)
// Should be ignored because 1500 < 2000
const mediumInput = [1500, 1500, 1500 + 2048, 1500]; // Adjusted for baseline
const res3 = tracker.calculatePosition(mediumInput);

if (res3 === null) {
    console.log("   RESULT: NULL (Noise Gated)");
    console.log("   STATUS: PASS - High noise floor successfully ignored.");
} else {
    console.log("   RESULT:", res3);
    console.log("   STATUS: FAIL - Gate leaked noise.");
}

// ==========================================
// TEST 5: FOCUS/SHARPENING
// ==========================================
console.log("\n[TEST 5] Algorithm Focus (Sharpening)");
tracker.setSharpening(10); // Max Focus
console.log("   ACTION: Set Focus to 10 (Winner Takes All)");

// Input: P1 (Top-Right) strong, P0 moderate crosstalk
const crosstalkInput = [2800, 3200, 2048, 0];
const res4 = tracker.calculatePosition(crosstalkInput);

// Expect result very close to P1 relative to P0
if (res4 && res4.x > 70) {
    console.log(`   RESULT: Position X=${res4.x.toFixed(1)} (Near 80)`);
    console.log("   STATUS: PASS - Strong inputs dominated (Crosstalk removed).");
} else {
    console.log("   RESULT:", res4);
    console.log("   STATUS: FAIL - Position drift detected.");
}

console.log("---------------------------------------------------");
console.log("       REPORT GENERATION COMPLETE");
console.log("---------------------------------------------------");
