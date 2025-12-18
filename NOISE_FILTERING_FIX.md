# Noise Filtering Fix - All Four Channels

## Problem Identified

Previously, when you changed sensitivity settings or thresholds, only the main detector (`detectorRef.current`) was being updated. The four multi-piezo detectors (`detectorsRef.current[0-3]`) were initialized with default config but never received configuration updates.

This meant:
- ❌ Piezo 0 had updated noise filtering
- ❌ Piezos 1-3 kept their initial default settings
- ❌ Inconsistent filtering across channels

## Solution Implemented

All configuration update handlers now loop through and update **all four detectors** plus the main detector.

### Updated Functions

1. **`handleSensitivityChange()`** - Lines 340-363
   - Updates main detector + all 4 channel detectors
   - Toast message now says "(all channels)"

2. **`handleCustomThresholdChange()`** - Lines 365-380
   - Updates main detector + all 4 channel detectors
   - Applies same threshold multiplier and MIN_RMS to all

3. **`lowerThresholdEightyPercent()`** - Lines 382-403
   - Updates main detector + all 4 channel detectors
   - Toast message now says "(all channels)"

4. **`handleRawGateChange()`** - Lines 405-420
   - Updates main detector + all 4 channel detectors
   - Applies same RAW_DELTA_GATE_ADC to all

## How It Works Now

When you adjust any setting:

```javascript
// Create configuration update object
const configUpdate = { ADAPTIVE_THRESHOLD_MULT: threshold, ... };

// Update main detector
if (detectorRef.current) {
  detectorRef.current.updateConfig(configUpdate);
}

// Update ALL four multi-piezo detectors
for (let i = 0; i < 4; i++) {
  if (detectorsRef.current[i]) {
    detectorsRef.current[i].updateConfig(configUpdate);
  }
}
```

## Result

✅ **All channels now have identical noise filtering**
✅ **All channels respond to sensitivity changes**
✅ **All channels use the same thresholds and gates**
✅ **Consistent behavior across all 4 piezo sensors**

## Noise Filtering Applied to All Channels

Each channel (0-3) now uses the **exact same** noise removal pipeline:

1. **Bandpass Filter (12-180 Hz)** - Removes DC and high-freq noise
2. **Baseline Tracking** - Centers signal around zero
3. **Adaptive MAD Noise Floor** - Robust noise estimation
4. **Raw Amplitude Gate** - Blocks very weak signals
5. **Energy Trigger** - Detects footsteps via RMS energy
6. **Multi-Stage Validation** - Rejects noise patterns

All settings synchronized across all channels:
- `ADAPTIVE_THRESHOLD_MULT` (default: 6.0x or custom)
- `MIN_RMS_RAW` (calculated based on threshold)
- `RAW_DELTA_GATE_ADC` (default: 210 ADC units)
- Plus all other DETECTION_CONFIG parameters

## Testing

To verify all channels are filtering noise the same way:

1. **Connect serial** and observe all 4 channel plots
2. **Adjust sensitivity** slider → All channels should respond
3. **Change raw gate** → All channels should filter accordingly
4. **Lower threshold 80%** → All channels should become more sensitive

You should see:
- ✅ Similar noise floor on all channels (if sensors are similar)
- ✅ All channels respond to same footsteps
- ✅ All channels reject electrical noise
- ✅ Consistent triggering behavior

## Configuration Synchronization

All detectors are initialized with the same `DETECTION_CONFIG` and stay synchronized:

```javascript
// Initialization (useEffect)
for (let i = 0; i < 4; i++) {
  detectorsRef.current[i] = new FootstepEventDetector(DETECTION_CONFIG);
}

// Any config change → propagated to all
detectorsRef.current[0].updateConfig(newConfig);
detectorsRef.current[1].updateConfig(newConfig);
detectorsRef.current[2].updateConfig(newConfig);
detectorsRef.current[3].updateConfig(newConfig);
```

---

**Fixed**: December 17, 2025
**Version**: 1.1
**Status**: ✅ All channels synchronized
