# Four-Channel Vibration Analysis - Implementation Summary

## Overview
Successfully implemented four separate channel plots for vibration visualization, replacing the previous overlaid multi-piezo display. Each channel now has its own dedicated plot with the same noise removal techniques applied.

## Changes Made

### 1. **Vibration Signal Plots** (4 Separate Channels)
- **Location**: `Vibrations.jsx` - Multi-Piezo Signals section
- **Change**: Replaced single overlaid chart with a 2x2 grid of individual channel plots
- **Features**:
  - Each piezo sensor (0-3) has its own chart
  - Individual color coding (Cyan, Red, Green, Yellow)
  - Sample count display for each channel
  - Capture highlighting on Channel 0
  - Responsive layout (1 column on mobile, 2 columns on desktop)

### 2. **LIF Neuron Plots** (4 Separate Channels)
- **Location**: `Vibrations.jsx` - Multi-Piezo LIF Neurons section
- **Change**: Replaced single overlaid chart with a 2x2 grid of individual neuron plots
- **Features**:
  - Each LIF neuron plot shows membrane potential for its corresponding piezo
  - Spike rate (Hz) displayed for each channel
  - Threshold line at 0.025 (red dashed)
  - Compact 2x2 grid layout

## Noise Removal Technique (Applied to All Channels)

The noise removal is implemented in `signalProcessing.js` through the `FootstepEventDetector` class. Here's how it works:

### Signal Processing Pipeline

1. **Bandpass Filter (12-180 Hz)**
   - Removes DC offset and high-frequency noise
   - Isolates footstep frequency range
   - Biquad 2nd order Butterworth filter
   ```javascript
   filtered = bandpassFilter(raw, config)
   ```

2. **Adaptive Baseline Tracking**
   - Tracks DC offset (baselineMean) using rolling window
   - Centers signal around zero
   - Window size: 200 samples (1 second at 200Hz)

3. **Rolling MAD Noise Floor**
   - Calculates Median Absolute Deviation (MAD) for robust noise estimation
   - Window: 100 samples (500ms)
   - Adaptive threshold = MAD × multiplier (default 6.0x)
   - Minimum noise floor: 0.015 (normalized)

4. **Raw Amplitude Gate**
   - Filters out very weak signals in ADC domain
   - Default gate: 210 ADC units
   - Prevents triggering on electrical noise

5. **RMS Normalization**
   - Window-based RMS calculation (500ms)
   - Normalizes signal strength for consistent detection
   - Clips to [-1, 1] range

6. **Energy-Triggered Detection**
   - Windowed RMS energy calculation (22ms window)
   - Triggers when energy > adaptive threshold
   - Captures pre-buffer (80ms) + event + post-buffer (260ms)

7. **Validation Filters** (Multi-stage rejection)
   - **Duration check**: 20-400ms (reject too short/long events)
   - **RMS check**: Minimum 0.005 (reject very weak signals)
   - **Continuous noise rejection**: Checks coefficient of variation
   - **Rapid spike rejection**: Max 8 spikes/sec (electrical noise)
   - **Decay check**: Requires proper energy decay (footstep characteristic)
   - **Spectral validation**: 20-120 Hz band must have >10% energy

### Key Configuration Parameters

```javascript
DETECTION_CONFIG = {
  SAMPLE_RATE: 200,                    // Hz
  BANDPASS_LOW_HZ: 12,                 // Bandpass low cutoff
  BANDPASS_HIGH_HZ: 180,               // Bandpass high cutoff
  ADAPTIVE_THRESHOLD_MULT: 6.0,        // MAD multiplier
  MIN_NOISE_FLOOR: 0.015,              // Minimum noise floor
  RAW_DELTA_GATE_ADC: 110,             // Raw amplitude gate
  MIN_RMS_RAW: 0.005,                  // Minimum RMS for valid event
  GAIN: 50.0                           // Visualization amplification
}
```

### LIF Neuron Processing

Each channel also has a Leaky Integrate-and-Fire (LIF) neuron that:
- Integrates filtered signal energy
- Fires (spikes) when membrane potential exceeds threshold (0.025)
- Uses exponential smoothing (alpha = 0.22)
- Tracks spike rate for each channel
- Has refractory period (10ms) after spiking

## Data Flow per Channel

```
Raw ADC → Center (baseline removal) → Bandpass Filter → Normalize (RMS) 
  → Energy Detection → Validation → Event Capture
  → LIF Neuron Processing → Visualization
```

## Usage

1. **Connect Serial**: Click "Connect Serial" button
2. **Data flows to all 4 channels**: Each piezo sensor processes independently
3. **View separate plots**: 
   - Top section: 4 vibration signal plots (2x2 grid)
   - Bottom section: 4 LIF neuron plots (2x2 grid) + FFT
4. **Same noise removal**: All channels use identical filter/detection settings

## Benefits

✅ **Individual channel analysis**: Easier to see which sensor detects what
✅ **Same noise rejection**: Consistent processing across all channels
✅ **Better debugging**: Can identify faulty sensors or placement issues
✅ **Cleaner visualization**: No overlapping signals
✅ **Responsive layout**: Works on mobile and desktop

## Code Structure

- **Processing**: `processPiezoSample(piezoIndex, rawValue, timestamp)`
  - Uses channel-specific detector: `detectorsRef.current[piezoIdx]`
  - Uses channel-specific LIF neuron: `lifNeuronsRef.current[piezoIdx]`
  
- **Buffers** (per channel):
  - `amplifiedDataMultiRef.current[piezoIdx]` - Filtered signal buffer
  - `lifDataMultiRef.current[piezoIdx]` - LIF membrane potential buffer
  - `spikeMarkersMultiRef.current[piezoIdx]` - Spike markers buffer
  - `manualBuffersMultiRef.current[piezoIdx]` - Manual capture buffer

- **Visualization**: Each channel renders independently in a grid layout

## Future Enhancements

- [ ] Add cross-channel correlation analysis
- [ ] Implement sensor fusion for improved detection
- [ ] Add individual gain control per channel
- [ ] Export multi-channel data for offline analysis
- [ ] Add channel enable/disable toggles
