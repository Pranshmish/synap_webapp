import { useState, useEffect, useRef, useCallback } from "react";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import {
  Activity,
  PlugZap,
  Play,
  Cpu,
  Database,
  BrainCircuit,
  Users,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  RotateCcw,
  Table,
  Zap,
  Radio,
  TrendingUp,
  Settings,
  Eye,
  EyeOff,
  Download,
  Upload,
  Sliders,
  Brain,
  User,
  X,
  Waves,
} from "lucide-react";

// Import SignalVisualization component
import SignalVisualization from "../components/SignalVisualization";

// Import API and utilities
import { api, BUFFER_CONFIG } from "../config/api";
import {
  formatSampleCounts,
  formatPrediction,
  formatMetrics,
  isConfidentMatch,
} from "../utils/formatData";
import {
  FootstepEventDetector,
  LIFNeuron,
  DETECTION_CONFIG,
  SENSITIVITY_PRESETS,
  mean,
  std,
  computeFFT,
} from "../utils/signalProcessing";

ChartJS.register(
  LineElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Filler
);

// One-Class Anomaly Detection - Only HOME samples needed for training
// Intruders are automatically detected as anomalies (outliers from HOME patterns)
const TRAINING_MODE = {
  value: "FAMILY",
  label: "🏠 Family Training",
  color: "from-green-500 to-emerald-500",
  description: "Train on family members. Intruders detected by low confidence."
};

// Chart options for better performance
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 0 },
  scales: {
    x: { display: false },
    y: {
      grid: { color: 'rgba(255,255,255,0.1)' },
      ticks: { color: '#9ca3af' }
    }
  },
  plugins: {
    legend: { display: false }
  }
};

const fftChartOptions = {
  ...chartOptions,
  scales: {
    x: {
      display: true,
      title: { display: true, text: 'Frequency (Hz)', color: '#9ca3af' },
      ticks: { color: '#9ca3af' }
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.1)' },
      ticks: { color: '#9ca3af' },
      title: { display: true, text: 'Magnitude', color: '#9ca3af' }
    }
  }
};

function Vibrations() {
  // ============== CORE STATE ==============
  // Data can be saved as HOME or INTRUDER based on saveAsIntruder toggle
  const [labelName, setLabelName] = useState(""); // Person name (e.g., Apurv, Samir)
  const [saveAsIntruder, setSaveAsIntruder] = useState(false); // Toggle to save as INTRUDER class
  const [status, setStatus] = useState("Idle — Connect serial to begin");
  const [prediction, setPrediction] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sampleCounts, setSampleCounts] = useState({});
  const [trainingMetrics, setTrainingMetrics] = useState(null);
  const [trainingDetails, setTrainingDetails] = useState(null); // Detailed training results
  const [showTrainingDetails, setShowTrainingDetails] = useState(false); // Toggle details panel
  const [selectedDatasets, setSelectedDatasets] = useState([]); // Selected datasets for training
  const [availableDatasets, setAvailableDatasets] = useState([]); // Available datasets from backend

  // ============== MULTI-MODEL STATE ==============
  const [selectedModel, setSelectedModel] = useState('MLPClassifier'); // Default model
  const [activeModel, setActiveModel] = useState('MLPClassifier'); // Currently active model
  const [availableModels, setAvailableModels] = useState([
    // Default models (will be updated from backend)
    {
      name: 'RandomForestEnsemble',
      display_name: 'Random Forest + Isolation Forest',
      short_name: 'RF',
      description: 'Ensemble classifier with anomaly detection',
      ready: true,
      trained: false,
      cv_accuracy: 0,
      is_active: false
    },
    {
      name: 'MLPClassifier',
      display_name: 'MLP Neural Network',
      short_name: 'MLP',
      description: 'Multi-layer perceptron classifier',
      ready: true,
      trained: false,
      cv_accuracy: 0,
      is_active: true
    },
    {
      name: 'HybridLSTMSNN',
      display_name: 'Hybrid LSTM + SNN',
      short_name: 'Hybrid',
      description: 'LSTM + Spiking Neural Network (Coming Soon)',
      ready: false,
      trained: false,
      cv_accuracy: 0,
      is_active: false
    }
  ]);
  const [modelsStatus, setModelsStatus] = useState({
    RandomForestEnsemble: { short_name: 'RF', display_name: 'Random Forest + Isolation Forest', trained: false, ready: true },
    MLPClassifier: { short_name: 'MLP', display_name: 'MLP Neural Network', trained: false, ready: true },
    HybridLSTMSNN: { short_name: 'Hybrid', display_name: 'Hybrid LSTM + SNN', trained: false, ready: false }
  });

  // ============== DUAL DATASET STATUS ==============
  const [dualDatasetStatus, setDualDatasetStatus] = useState({
    home_csv: { samples: 0, persons: [] },
    progress_percent: 0,
    target_samples: 150
  });
  const [mlpModelStatus, setMlpModelStatus] = useState({ trained: false, accuracy: 0 });

  // ============== LOADING STATES ==============
  const [isSaving, setIsSaving] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // ============== DATASET MANAGER ==============
  const [datasetInfo, setDatasetInfo] = useState(null);
  const [showDatasetManager, setShowDatasetManager] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef(null);

  // ============== DATASET PREVIEW ==============
  const [showDatasetPreview, setShowDatasetPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadingPerson, setDownloadingPerson] = useState(null); // Track which person's dataset is downloading

  // ============== SIGNAL VISUALIZATION ==============
  const [showVisualization, setShowVisualization] = useState(false);
  const [vizSource, setVizSource] = useState(null);
  const [vizSampleId, setVizSampleId] = useState(null);

  // ============== SIGNAL DATA ==============
  const [amplifiedData, setAmplifiedData] = useState([]);
  const [fftData, setFftData] = useState({ frequencies: [], magnitudes: [] });
  const [lifData, setLifData] = useState([]);
  const [spikeMarkers, setSpikeMarkers] = useState([]);
  const [captureHighlight, setCaptureHighlight] = useState(null); // {startIdx, endIdx, timestamp} for highlighting captured region

  // ============== EVENT DETECTION STATE ==============
  const [validatedEvents, setValidatedEvents] = useState([]);
  const [currentEventInfo, setCurrentEventInfo] = useState(null);
  const [detectionStats, setDetectionStats] = useState({
    totalSamples: 0,
    eventsDetected: 0,
    noiseRejected: 0,
    lastRejectionReason: null
  });

  // ============== MODE FLAGS ==============
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [livePredictEnabled, setLivePredictEnabled] = useState(false);
  const [manualCaptureMode, setManualCaptureMode] = useState(false);
  const [predictionMode, setPredictionMode] = useState(false);
  const [saveAllVisibleMode, setSaveAllVisibleMode] = useState(false); // Save everything visible on graph
  const manualBufferRef = useRef([]);
  const visibleBufferRef = useRef([]); // Buffer for Save All Visible mode
  const lastVisibleSaveRef = useRef(0); // Debounce for visible saves

  // ============== SENSITIVITY/THRESHOLD ==============
  const [sensitivity, setSensitivity] = useState('custom'); // Default to custom for 1.5 setting
  const [customThreshold, setCustomThreshold] = useState(1.5); // Default: 1.5 (user optimized)
  const [rawGate, setRawGate] = useState(210); // Default: 210 ADC (user optimized)
  const [spikeThreshold, setSpikeThreshold] = useState(0.2); // Spike threshold for Save All Visible mode

  // ============== ML THRESHOLD OVERRIDE ==============
  const [mlThresholdOverride, setMlThresholdOverride] = useState(null); // null = use model default
  const [customMlThreshold, setCustomMlThreshold] = useState(0.0);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.45); // Min confidence for HOME

  // ============== TOASTS ==============
  const [toasts, setToasts] = useState([]);

  // ============== REFS ==============
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const readableStreamClosedRef = useRef(null);
  const stopRef = useRef(false);
  const alarmRef = useRef(null);
  const detectorRef = useRef(null);
  const lifNeuronRef = useRef(null);
  const lastSaveTimeRef = useRef(0);
  const lineBufferRef = useRef("");

  // High-performance buffers for visualization
  const amplifiedDataRef = useRef([]); // Stores {time, value}
  const lifDataRef = useRef([]);       // Stores {time, membrane}
  const spikeMarkersRef = useRef([]);  // Stores {time, value}
  const lastStatusUpdateRef = useRef(0);
  const animationFrameRef = useRef(null);

  // ============== VISUALIZATION LOOP ==============
  // Syncs mutable refs to React state at 60FPS (screen refresh rate) to prevent UI freezing
  useEffect(() => {
    const updateVisualization = () => {
      if (amplifiedDataRef.current.length > 0) {
        // Update amplified data state
        setAmplifiedData([...amplifiedDataRef.current]);
      }

      if (lifDataRef.current.length > 0) {
        // Update LIF data state
        setLifData([...lifDataRef.current]);
      }

      if (spikeMarkersRef.current.length > 0) {
        setSpikeMarkers([...spikeMarkersRef.current]);
      }

      animationFrameRef.current = requestAnimationFrame(updateVisualization);
    };

    // Start loop
    animationFrameRef.current = requestAnimationFrame(updateVisualization);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // ============== INITIALIZE DETECTOR & LIF ==============
  useEffect(() => {
    detectorRef.current = new FootstepEventDetector(DETECTION_CONFIG);
    lifNeuronRef.current = new LIFNeuron(0.020, 0.025, 0.010, 200);
  }, []);

  // ============== SENSITIVITY CHANGE HANDLER ==============
  const handleSensitivityChange = (newSensitivity) => {
    setSensitivity(newSensitivity);
    if (newSensitivity === 'custom') {
      // Keep custom threshold - apply to adaptive threshold multiplier
      if (detectorRef.current) {
        detectorRef.current.updateConfig({ ADAPTIVE_THRESHOLD_MULT: customThreshold });
      }
    } else {
      const preset = SENSITIVITY_PRESETS[newSensitivity];
      if (preset && detectorRef.current) {
        detectorRef.current.updateConfig(preset);
        setCustomThreshold(preset.ADAPTIVE_THRESHOLD_MULT || 3.2);
      }
    }
    showToast(`🎚️ Sensitivity set to ${newSensitivity}`, 'success');
  };

  const handleCustomThresholdChange = (value) => {
    const threshold = parseFloat(value);
    if (!isNaN(threshold) && threshold > 0) {
      setCustomThreshold(threshold);
      setSensitivity('custom');
      if (detectorRef.current) {
        // Update adaptive threshold multiplier
        detectorRef.current.updateConfig({
          ADAPTIVE_THRESHOLD_MULT: threshold,
          // Very low MIN_RMS - any visible signal should pass
          MIN_RMS_RAW: Math.max(0.003, Math.min(0.04, 0.01 * threshold))
        });
      }
    }
  };

  // Lower threshold quick action (reduce by 80%)
  const lowerThresholdEightyPercent = () => {
    const newVal = Math.max(0.1, customThreshold * 0.2);
    setCustomThreshold(newVal);
    setSensitivity('custom');
    if (detectorRef.current) {
      detectorRef.current.updateConfig({
        ADAPTIVE_THRESHOLD_MULT: newVal,
        MIN_RMS_RAW: Math.max(0.003, Math.min(0.04, 0.01 * newVal))
      });
    }
    showToast(`⬇️ Threshold reduced by 80% → ${newVal.toFixed(2)}x`, 'success');
  };

  // Raw amplitude gate handler
  const handleRawGateChange = (value) => {
    const gate = parseInt(value, 10);
    if (!isNaN(gate) && gate >= 0 && gate <= 2048) {
      setRawGate(gate);
      if (detectorRef.current) {
        detectorRef.current.updateConfig({ RAW_DELTA_GATE_ADC: gate });
      }
    }
  };

  // ============== TOAST SYSTEM ==============
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ============== SERIAL SUPPORT CHECK ==============
  useEffect(() => {
    if (!("serial" in navigator)) {
      showToast("⚠ Web Serial API NOT supported. Use Chrome/Edge desktop.", "error");
    }
  }, [showToast]);

  // ============== API: FETCH STATUS ==============
  const fetchStatus = async () => {
    try {
      const result = await api.getStatus();
      const samplesPerPerson = result.samples_per_person || {};
      setSampleCounts(samplesPerPerson);

      // Fetch dual dataset status and MLP model status
      try {
        const datasetStatus = await api.getDatasetStatus();
        console.log('[fetchStatus] Dataset status:', datasetStatus);
        if (datasetStatus.dual_dataset) {
          setDualDatasetStatus(datasetStatus.dual_dataset);
        }
        if (datasetStatus.mlp_model) {
          console.log('[fetchStatus] MLP status:', datasetStatus.mlp_model);
          setMlpModelStatus(datasetStatus.mlp_model);
        }

        // Update available datasets - try sample_counts first, then fall back to individual_files
        let datasetNames = Object.keys(samplesPerPerson).filter(name =>
          name.toUpperCase().startsWith('HOME')
        );

        // If no datasets from sample_counts, use individual_files from dual_dataset
        if (datasetNames.length === 0 && datasetStatus.dual_dataset?.individual_files) {
          datasetNames = datasetStatus.dual_dataset.individual_files.map(f => f.name);
          // Also update sample counts from individual files
          const countsFromFiles = {};
          datasetStatus.dual_dataset.individual_files.forEach(f => {
            countsFromFiles[f.name] = f.samples;
          });
          setSampleCounts(countsFromFiles);
        }
        console.log('[fetchStatus] Available datasets:', datasetNames);

        if (datasetNames.length > 0) {
          setAvailableDatasets(datasetNames);
          // Auto-select all datasets if none selected
          if (selectedDatasets.length === 0) {
            setSelectedDatasets(datasetNames);
          }
        }
      } catch (e) {
        console.log("Dataset status not available (backend may need update)", e);
      }

      // Fetch available models
      try {
        const modelsResult = await api.getAvailableModels();
        console.log('[fetchStatus] Available models:', modelsResult);
        if (modelsResult.models) {
          setAvailableModels(modelsResult.models);
          setActiveModel(modelsResult.active_model || 'MLPClassifier');

          // Build models status object
          const statusObj = {};
          modelsResult.models.forEach(m => {
            statusObj[m.name] = m;
          });
          setModelsStatus(statusObj);
        }
      } catch (e) {
        console.log("Models status not available (backend may need update)", e);
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  };

  // ============== FETCH STATUS ON MOUNT ==============
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // ============== CLEANUP ==============
  useEffect(() => {
    return () => {
      // Force immediate cleanup on unmount
      stopRef.current = true;
      if (readerRef.current) readerRef.current.cancel().catch(() => { });
      // Note: Full async cleanup can't be guaranteed here, but we set flags
    };
  }, []);

  // ============== SERIAL: CONNECT ==============
  const connectSerial = async () => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: BUFFER_CONFIG?.BAUD_RATE || 115200 }); // Default buffer config fallback

      const decoder = new TextDecoderStream();
      // Pipe to writable and capture the closed promise
      const readableStreamClosed = port.readable.pipeTo(decoder.writable);
      readableStreamClosedRef.current = readableStreamClosed;

      const reader = decoder.readable.getReader();

      portRef.current = port;
      readerRef.current = reader;
      stopRef.current = false;

      // Reset detector
      detectorRef.current?.reset();
      lifNeuronRef.current?.reset();

      setIsConnected(true);
      setAmplifiedData([]);
      setLifData([]);
      setSpikeMarkers([]);
      setValidatedEvents([]);
      setDetectionStats({ totalSamples: 0, eventsDetected: 0, noiseRejected: 0, lastRejectionReason: null });

      const effectiveLabel = getEffectiveLabel();
      setStatus(`🟢 Connected — Recording as "${effectiveLabel}"...`);

      // Start reading without awaiting it here so initialization completes
      readLoop(reader).catch(err => {
        console.error("Read loop error:", err);
        disconnectSerial();
      });
    } catch (err) {
      console.error(err);
      setStatus("❌ Failed to connect to serial port");
      showToast(`❌ Serial connection failed: ${err.message}`, "error");
      disconnectSerial().catch(() => { }); // Attempt cleanup
    }
  };

  // ============== SERIAL: DISCONNECT ==============
  const disconnectSerial = async () => {
    if (!isConnected && !portRef.current) return;

    setStatus("🔌 Disconnecting...");
    stopRef.current = true;

    try {
      // 1. Cancel the reader
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }

      // 2. Wait for the stream decoding to finish
      if (readableStreamClosedRef.current) {
        await readableStreamClosedRef.current.catch(() => { }); // Ignore stream errors during close
        readableStreamClosedRef.current = null;
      }

      // 3. Close the port
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch (e) {
      console.warn("Error during disconnect cleanup:", e);
    }

    setIsConnected(false);
    setStatus("🔌 Disconnected");
  };

  // ============== SERIAL: READ LOOP ==============
  const readLoop = async (reader) => {
    while (!stopRef.current) {
      try {
        const { value, done } = await reader.read();
        if (done || !value) break;

        // Accumulate data and process complete lines
        lineBufferRef.current += value;
        const lines = lineBufferRef.current.split("\n");
        lineBufferRef.current = lines.pop() || "";

        for (const line of lines) {
          processSerialLine(line.trim());
        }
      } catch (err) {
        if (!stopRef.current) {
          console.error("Serial read error:", err);
        }
        break;
      }
    }
  };

  // ============== PROCESS SERIAL LINE (OPTIMIZED) ==============
  const processSerialLine = (line) => {
    if (!line) return;

    // Parse ESP32 formats robustly
    let rawValue;
    const rawMatch = line.match(/Raw\s*[:=]?\s*(\d{1,4})/i);
    if (rawMatch) {
      rawValue = parseInt(rawMatch[1], 10);
    } else {
      const anyNum = line.match(/\b(\d{1,4})\b/);
      rawValue = anyNum ? parseInt(anyNum[1], 10) : NaN;
    }

    if (isNaN(rawValue) || rawValue < 0 || rawValue > 4095) return;

    const detector = detectorRef.current;
    if (!detector) return;

    const result = detector.processSample(rawValue);
    const timestamp = performance.now() / 1000;

    // 1. Update Detection Stats - throttle to reduce renders
    // Simple counter updates are cheap, but doing it 200/sec is still wasteful.
    // We'll let React batching handle this for now as it's just a counter.
    setDetectionStats(prev => ({
      ...prev,
      totalSamples: prev.totalSamples + 1
    }));

    // 2. Buffer Raw Data for Manual Capture
    manualBufferRef.current.push(rawValue);
    if (manualBufferRef.current.length > 100) manualBufferRef.current.shift();

    // 3. Update Visualization Buffers (Mutable Refs) instead of State
    amplifiedDataRef.current.push({ time: timestamp, value: result.filtered });
    if (amplifiedDataRef.current.length > 500) amplifiedDataRef.current.shift();

    // ============== SAVE ALL VISIBLE MODE ==============
    // Captures everything that passes noise filter (rawGate ADC & spikeThreshold)
    if (saveAllVisibleMode && !result.isWarmup) {
      const rawDelta = Math.abs(rawValue - (detector.baselineMean || 2048));
      const filteredAbs = Math.abs(result.filtered);

      // If signal passes both filters, add to visible buffer
      if (rawDelta >= rawGate && filteredAbs >= spikeThreshold) {
        visibleBufferRef.current.push(rawValue);
      } else if (visibleBufferRef.current.length > 0) {
        // Signal dropped - check if we have enough to save
        const now = Date.now();
        if (visibleBufferRef.current.length >= 20 && (now - lastVisibleSaveRef.current) > 500) {
          // Create event from visible buffer
          const capturedSamples = [...visibleBufferRef.current];
          const centered = capturedSamples.map(v => v - (detector.baselineMean || 2048));

          // Compute LIF for auto-captured event
          const lifParams = { tau: 0.020, threshold: 0.025, refractory: 0.010, rate: 200 };
          const tempLif = new LIFNeuron(lifParams.tau, lifParams.threshold, lifParams.refractory, lifParams.rate);
          const lifMembrane = [];
          const lifSpikes = [];
          const normalizedInput = centered.map(v => Math.abs(v) / 500);

          normalizedInput.forEach(val => {
            const res = tempLif.step(val);
            lifMembrane.push(res.membrane);
            lifSpikes.push(res.spiked ? 1 : 0);
          });

          const visibleEvent = {
            raw: capturedSamples,
            centered: centered,
            metrics: {
              duration_ms: (capturedSamples.length / 200) * 1000,
              rms: Math.sqrt(capturedSamples.reduce((sum, v) => sum + Math.pow(v - (detector.baselineMean || 2048), 2), 0) / capturedSamples.length),
              peakDev: Math.max(...capturedSamples.map(v => Math.abs(v - (detector.baselineMean || 2048)))),
              samples: capturedSamples.length
            },
            // Add LIF Data
            lifMembrane: lifMembrane,
            lifSpikes: lifSpikes,
            lifTime: capturedSamples.map((_, i) => i / 200),

            baselineMean: detector.baselineMean || 2048,
            noiseFloor: detector.noiseFloor || 0.02,
            timestamp: now,
            isNoise: false,
            visibleCapture: true
          };

          // Add to validated events
          setValidatedEvents(prev => {
            const updated = [...prev, visibleEvent];
            console.log(`📊 Visible capture! ${capturedSamples.length} samples, Total: ${updated.length}`);
            return updated;
          });

          setDetectionStats(prev => ({
            ...prev,
            eventsDetected: prev.eventsDetected + 1
          }));

          lastVisibleSaveRef.current = now;
          setStatus(`📊 Auto-captured ${capturedSamples.length} samples (visible activity)`);
        }
        // Clear buffer for next capture
        visibleBufferRef.current = [];
      }
    }

    // 5. LIF Neuron Processing
    const lif = lifNeuronRef.current;
    if (lif && !result.isWarmup) {
      const normalizedInput = Math.abs(result.filtered) / 500;
      const lifResult = lif.step(normalizedInput);

      lifDataRef.current.push({ time: timestamp, membrane: lifResult.membrane });
      if (lifDataRef.current.length > 500) lifDataRef.current.shift();

      if (lifResult.spiked) {
        spikeMarkersRef.current.push({ time: timestamp, value: lifResult.membrane });
        if (spikeMarkersRef.current.length > 50) spikeMarkersRef.current.shift();
      }
    }

    // 6. Status Updates (Throttled)
    const now = Date.now();
    if (now - lastStatusUpdateRef.current > 200) { // Update status max 5 times/sec
      if (result.isWarmup) {
        const progress = result.warmupProgress ? (result.warmupProgress * 100).toFixed(0) : '...';
        setStatus(`🔄 Warming up noise floor... ${progress}%`);
      } else if (result.eventActive) {
        setStatus(`📊 Capturing: ${result.eventLength} samples`);
        setCurrentEventInfo({ length: result.eventLength, energy: result.energy, threshold: result.threshold, noiseFloor: result.noiseFloor });
      } else {
        setCurrentEventInfo(null);
        if (!result.event) {
          // Show energy-based status with noise floor
          const energyRatio = result.energy / Math.max(result.threshold, 0.001);
          setStatus(`🟢 Noise: ${result.noiseFloor?.toFixed(4) || '?'} | Thresh: ${result.threshold?.toFixed(4) || '?'} | Energy: ${result.energy?.toFixed(4) || '?'} (${(energyRatio * 100).toFixed(0)}%)`);
        }
      }
      lastStatusUpdateRef.current = now;
    }

    // Handle detected event (could be valid footstep or rejected noise)
    // Skip if in manual capture mode
    if (result.event && !manualCaptureMode) {
      if (result.event.isNoise || result.event.rejected) {
        // Noise event rejected - do not save, just log
        setDetectionStats(prev => ({
          ...prev,
          noiseRejected: (prev.noiseRejected || 0) + 1
        }));
        console.log('❌ Noise rejected:', result.event.reasons);
        setStatus(`🔇 Noise rejected: ${result.event.reasons?.[0] || 'Invalid pattern'}`);
      } else {
        // Valid footstep
        handleValidatedEvent(result.event);
      }
    }
  };

  // ============== MANUAL CAPTURE ==============
  const handleManualCapture = () => {
    if (manualBufferRef.current.length < 25) {
      showToast('⚠ Not enough data - wait a moment', 'warning');
      return;
    }

    // Create a simple event from the manual buffer
    const capturedSamples = [...manualBufferRef.current];
    const detector = detectorRef.current;
    const captureTime = Date.now();

    // Calculate the indices for highlighting on the chart
    // The capture window is the last 100 samples (0.5 second at 200Hz)
    const currentDataLength = amplifiedData.length;
    const capturedLength = capturedSamples.length;
    const startIdx = Math.max(0, currentDataLength - capturedLength);
    const endIdx = currentDataLength;

    // Set capture highlight for visualization
    setCaptureHighlight({
      startIdx,
      endIdx,
      timestamp: captureTime,
      samples: capturedLength
    });

    // Clear highlight after 3 seconds
    setTimeout(() => {
      setCaptureHighlight(null);
    }, 3000);

    // Center the signal and compute FFT for manual capture
    const centered = capturedSamples.map(v => v - (detector?.baselineMean || 2048));
    const { frequencies, magnitudes } = computeFFT(centered, 200); // 200Hz sample rate

    // Compute LIF response for manually captured event
    const lifParams = { tau: 0.020, threshold: 0.025, refractory: 0.010, rate: 200 };
    const tempLif = new LIFNeuron(lifParams.tau, lifParams.threshold, lifParams.refractory, lifParams.rate);
    const lifMembrane = [];
    const lifSpikes = [];

    // Normalize input like the detector (approx 500 ADC peak reference)
    const normalizedInput = centered.map(v => Math.abs(v) / 500);

    normalizedInput.forEach(val => {
      const res = tempLif.step(val);
      lifMembrane.push(res.membrane);
      lifSpikes.push(res.spiked ? 1 : 0);
    });

    const manualEvent = {
      raw: capturedSamples,
      centered: centered,
      metrics: {
        duration_ms: (capturedSamples.length / 200) * 1000,
        rms: 0,
        peakDev: Math.max(...centered.map(Math.abs)),
        samples: capturedSamples.length
      },
      frequencies: frequencies,
      magnitudes: magnitudes,
      // Add LIF Data
      lifMembrane: lifMembrane,
      lifSpikes: lifSpikes,
      lifTime: capturedSamples.map((_, i) => i / 200),

      baselineMean: detector?.baselineMean || 2048,
      noiseFloor: detector?.noiseFloor || 0.02,
      timestamp: captureTime,
      isNoise: false,
      manualCapture: true
    };

    // Update FFT display for manual capture
    if (frequencies && magnitudes && frequencies.length > 0) {
      setFftData({
        frequencies: frequencies.slice(0, 50),
        magnitudes: magnitudes.slice(0, 50)
      });
      console.log('📊 FFT data updated from manual capture');
    }

    // Add to validated events
    setValidatedEvents(prev => {
      const updated = [...prev, manualEvent];
      console.log(`📸 Manual capture! Total collected: ${updated.length}, Samples: ${capturedLength}`);
      showToast(`📸 Captured ${capturedSamples.length} samples (${(capturedLength / 200 * 1000).toFixed(0)}ms)!`, 'success');
      return updated;
    });

    // Update stats
    setDetectionStats(prev => ({
      ...prev,
      eventsDetected: prev.eventsDetected + 1
    }));
  };

  // ============== HANDLE VALIDATED EVENT ==============
  const handleValidatedEvent = async (event) => {
    // CRITICAL: Block noise from being saved as training data
    if (event.isNoise || event.rejected) {
      console.log('⛔ Blocked noise event from being processed');
      return;
    }

    // Update FFT display - ensure data exists before setting
    if (event.frequencies && event.magnitudes && event.frequencies.length > 0) {
      setFftData({
        frequencies: event.frequencies.slice(0, 50),
        magnitudes: event.magnitudes.slice(0, 50)
      });
      console.log('📊 FFT data updated:', event.frequencies.length, 'frequency bins');
    } else {
      console.warn('⚠️ Event missing FFT data:', { hasFreq: !!event.frequencies, hasMag: !!event.magnitudes });
    }

    // Add to validated events
    setValidatedEvents(prev => {
      const updated = [...prev, event]; // Keep all events, not just last 9
      console.log(`✅ Event added! Total collected: ${updated.length}`);
      return updated;
    });

    // Update stats
    setDetectionStats(prev => ({
      ...prev,
      eventsDetected: prev.eventsDetected + 1
    }));

    // Show toast with footstep metrics
    const metrics = event.metrics;
    showToast(
      `✅ Footstep! Duration: ${metrics.duration_ms?.toFixed(0) || '?'}ms, RMS: ${metrics.rms?.toFixed(3) || '?'}`,
      'success'
    );

    setStatus(`✅ Valid footstep! ${metrics.duration_ms?.toFixed(0)}ms, Peak: ${metrics.peakDev?.toFixed(0)}, Band: ${(metrics.bandRatio * 100)?.toFixed(0)}%`);

    // Live predict with MLP if enabled and model trained
    if (livePredictEnabled && mlpModelStatus.trained && !isPredicting) {
      console.log('🔮 Triggering live MLP prediction...');
      await predictEventMLP(event);
    }

    // AUTO-SAVE LOGIC
    if (autoSaveEnabled) {
      const effectiveLabel = getEffectiveLabel();
      const backendData = FootstepEventDetector.toBackendFormat(event);

      if (backendData) {
        try {
          await api.saveTrainData(backendData, effectiveLabel);
          showToast(`💾 Auto-saved as "${effectiveLabel}"`, 'success');
          // Update status to reflect save
          await fetchStatus();
        } catch (error) {
          console.error("Auto-save failed:", error);
          showToast(`❌ Auto-save failed: ${error.message}`, 'error');
        }
      }
    }
  };

  // ============== GET EFFECTIVE LABEL ==============
  const getEffectiveLabel = () => {
    const customName = labelName.trim();
    const prefix = saveAsIntruder ? 'INTRUDER' : 'HOME';
    if (customName) {
      return `${prefix}_${customName}`;
    }
    return prefix;
  };

  // ============== PREDICT EVENT WITH MLP (Live Prediction) ==============
  const predictEventMLP = async (event) => {
    const backendData = FootstepEventDetector.toBackendFormat(event);
    if (!backendData) {
      console.log('⚠️ Cannot format event for prediction');
      return;
    }

    // Set predicting state for live predictions
    setIsPredicting(true);
    console.log('🔮 Live MLP predicting event...');

    try {
      const result = await api.predictMLP(backendData);

      const formatted = formatPrediction(result);
      console.log('🔮 MLP Prediction result:', result);
      setPrediction({ ...result, formatted });

      if (result.is_intruder) {
        alarmRef.current?.play();
        showToast(`🚨 ${result.prediction}`, 'error');
        setStatus(`🚨 ${result.alert}`);
      } else if (result.color_code === 'yellow') {
        showToast(`⚠ ${result.prediction}`, 'warning');
        setStatus(`⚠ ${result.alert}`);
      } else {
        showToast(`✅ ${result.prediction} (${(result.confidence * 100).toFixed(1)}%)`, 'success');
        setStatus(`✅ ${result.alert}`);
      }
    } catch (error) {
      console.error("MLP Live prediction failed:", error);
      showToast(`⚠️ Prediction error: ${error.message}`, 'warning');
    } finally {
      setIsPredicting(false);
    }
  };

  // ============== MANUAL SAVE ==============
  const handleSaveTrainData = async () => {
    if (validatedEvents.length === 0) {
      return showToast("⚠ No validated events to save.", "warning");
    }

    // Require person name for saving
    if (!labelName.trim()) {
      return showToast("⚠ Please enter a person name before saving!", "warning");
    }

    const effectiveLabel = getEffectiveLabel();
    setIsSaving(true);
    setStatus(`⬆ Uploading ${validatedEvents.length} samples as "${effectiveLabel}"...`);

    try {
      let frontendConverted = 0;
      let frontendRejected = 0;
      let backendSaved = 0;
      let backendRejected = 0;

      for (const event of validatedEvents) {
        const backendData = FootstepEventDetector.toBackendFormat(event);

        if (!backendData) {
          frontendRejected++;
          console.log(`⛔ Frontend rejected event:`, {
            hasRaw: !!event.raw,
            isNoise: event.isNoise,
            rejected: event.rejected,
            rawLength: event.raw?.length
          });
          continue;
        }

        frontendConverted++;

        // Prepare analysis data for backend (FFT, LIF, filtered waveform)
        const analysisData = {
          fftData: event.frequencies && event.magnitudes ? {
            frequencies: event.frequencies,
            magnitudes: event.magnitudes
          } : null,
          lifData: event.lifMembrane ? {
            membrane: event.lifMembrane,
            spikes: event.lifSpikes || [],
            time: event.lifTime || []
          } : null,
          filteredWaveform: event.centered || null
        };

        // Send to backend with analysis data for comprehensive plot saving
        const result = await api.saveTrainData(backendData, effectiveLabel, analysisData);

        if (result.valid_samples > 0) {
          backendSaved++;
        } else {
          backendRejected++;
          console.log(`⛔ Backend rejected sample (amplitude gate):`, {
            dataLength: backendData.length,
            max: Math.max(...backendData),
            min: Math.min(...backendData),
            range: Math.max(...backendData) - Math.min(...backendData)
          });
        }
      }

      await fetchStatus();
      setValidatedEvents([]);

      // Detailed save summary
      const totalEvents = validatedEvents.length;
      const totalRejected = frontendRejected + backendRejected;

      if (totalRejected > 0) {
        console.log(`📊 Save Summary: ${backendSaved}/${totalEvents} saved`);
        console.log(`   Frontend rejected: ${frontendRejected} (noise/invalid)`);
        console.log(`   Backend rejected: ${backendRejected} (low amplitude)`);
        showToast(
          `⚠️ Saved ${backendSaved}/${totalEvents} samples. ${totalRejected} rejected (${frontendRejected} noise, ${backendRejected} low amplitude)`,
          backendSaved > 0 ? 'warning' : 'error'
        );
      } else {
        showToast(`✅ Saved ${backendSaved} samples as "${effectiveLabel}"!`, 'success');
      }

      setStatus(`✅ Saved ${backendSaved}/${totalEvents} samples as "${effectiveLabel}"`);
    } catch (error) {
      showToast(`❌ Save failed: ${error.message}`, 'error');
      setStatus(`❌ Save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ============== TRAIN SELECTED MODEL ==============
  const handleTrainModel = async () => {
    if (selectedDatasets.length === 0) {
      showToast('⚠️ Please select at least one dataset to train on', 'warning');
      return;
    }

    const modelInfo = availableModels.find(m => m.name === selectedModel);
    const modelDisplayName = modelInfo?.short_name || selectedModel;

    setIsTraining(true);
    setStatus(`🧠 Training ${modelDisplayName} on ${selectedDatasets.length} dataset(s)...`);
    setTrainingDetails(null);
    setShowTrainingDetails(false);

    try {
      // Use the multi-model training endpoint
      const result = await api.trainSelectedModel(selectedModel, selectedDatasets);

      if (result.success) {
        const accuracy = result.metrics?.training_accuracy ?? 0;
        const cvAccuracy = result.metrics?.cv_accuracy ?? null;
        const cvStd = result.metrics?.cv_std ?? null;
        const cvScores = result.metrics?.cv_scores ?? [];
        const nFolds = result.metrics?.n_folds ?? 5;

        setTrainingMetrics(result.metrics);

        // Update model status based on which model was trained
        if (selectedModel === 'MLPClassifier') {
          setMlpModelStatus({ trained: true, accuracy: cvAccuracy || accuracy });
        }

        if (result.dual_dataset) {
          setDualDatasetStatus(result.dual_dataset);
        }

        // Store detailed training results
        setTrainingDetails({
          modelName: selectedModel,
          modelDisplayName,
          accuracy,
          cvAccuracy,
          cvStd,
          cvScores,
          nFolds,
          homeSamples: result.metrics?.home_samples || 0,
          intruderSamples: result.metrics?.intruder_samples || 0,
          totalSamples: result.metrics?.total_samples || 0,
          datasets: result.dataset_details?.datasets || [],
          datasetNames: result.dataset_details?.dataset_names || [],
          selectedDatasets: result.dataset_details?.selected_datasets || selectedDatasets,
          topFeatures: result.top_features || []
        });

        // Auto-show training details panel
        setShowTrainingDetails(true);

        // Show CV results if available
        const cvInfo = cvAccuracy !== null ? ` (CV: ${cvAccuracy}% ± ${cvStd}%)` : '';
        showToast(`🎯 ${modelDisplayName} trained! Accuracy: ${accuracy}%${cvInfo}`, 'success');
        setStatus(`🎯 ${modelDisplayName} ready! Accuracy: ${accuracy}%${cvInfo}`);
      } else {
        throw new Error(result.error || 'Training failed');
      }

      await fetchStatus();
    } catch (error) {
      showToast(`❌ ${modelDisplayName} Training failed: ${error.message}`, 'error');
      setStatus(`❌ ${modelDisplayName} Training failed: ${error.message}`);
    } finally {
      setIsTraining(false);
    }
  };

  // Legacy alias for MLP training (backward compatibility)
  const handleTrainMLP = handleTrainModel;

  // ============== SET ACTIVE MODEL ==============
  const handleSetActiveModel = async (modelName) => {
    const modelInfo = availableModels.find(m => m.name === modelName);
    if (!modelInfo?.trained) {
      showToast(`⚠️ ${modelInfo?.short_name || modelName} is not trained yet. Train it first!`, 'warning');
      return;
    }

    try {
      const result = await api.setActiveModel(modelName);
      if (result.success) {
        setActiveModel(modelName);
        showToast(`✅ Switched to ${modelInfo?.short_name || modelName} for predictions`, 'success');
        await fetchStatus();
      }
    } catch (error) {
      showToast(`❌ Failed to switch model: ${error.message}`, 'error');
    }
  };

  // ============== PREDICT WITH SELECTED MODEL ==============
  const handlePredictWithModel = async () => {
    if (validatedEvents.length === 0) {
      return showToast("⚠ No footstep events to predict.", "warning");
    }

    const modelInfo = modelsStatus[activeModel];
    if (!modelInfo?.trained) {
      return showToast(`⚠ ${activeModel} not trained. Train first!`, "warning");
    }

    setIsPredicting(true);
    const modelName = modelInfo?.short_name || activeModel;
    setStatus(`🔮 Predicting with ${modelName}...`);

    const lastEvent = validatedEvents[validatedEvents.length - 1];
    const backendData = FootstepEventDetector.toBackendFormat(lastEvent);

    if (!backendData) {
      showToast("⚠ Invalid event data", "warning");
      setIsPredicting(false);
      return;
    }

    try {
      const result = await api.predictWithModel(backendData, activeModel);

      const formatted = formatPrediction(result);
      setPrediction({ ...result, formatted, model_used: activeModel });

      if (result.is_intruder) {
        alarmRef.current?.play();
        showToast(`🚨 ${result.prediction} (${modelName})`, 'error');
        setStatus(`🚨 ${result.alert} [${modelName}]`);
      } else if (result.color_code === 'yellow') {
        showToast(`⚠ ${result.prediction} (${modelName})`, 'warning');
        setStatus(`⚠ ${result.alert} [${modelName}]`);
      } else {
        showToast(`✅ ${result.prediction} (${modelName})`, 'success');
        setStatus(`✅ ${result.alert} [${modelName}]`);
      }
    } catch (error) {
      showToast(`❌ Prediction failed: ${error.message}`, 'error');
      setStatus(`❌ Prediction failed: ${error.message}`);
    } finally {
      setIsPredicting(false);
    }
  };

  // ============== PREDICT WITH MLP (Manual button) ==============
  const handlePredictMLP = async () => {
    if (validatedEvents.length === 0) {
      return showToast("⚠ No footstep events to predict.", "warning");
    }

    if (!mlpModelStatus.trained) {
      return showToast("⚠ MLP not trained. Train first!", "warning");
    }

    setIsPredicting(true);
    setStatus("🔮 Predicting with MLP + Rules...");

    const lastEvent = validatedEvents[validatedEvents.length - 1];
    const backendData = FootstepEventDetector.toBackendFormat(lastEvent);

    if (!backendData) {
      showToast("⚠ Invalid event data", "warning");
      setIsPredicting(false);
      return;
    }

    try {
      const result = await api.predictMLP(backendData);

      const formatted = formatPrediction(result);
      setPrediction({ ...result, formatted });

      if (result.is_intruder) {
        alarmRef.current?.play();
        showToast(`🚨 ${result.prediction}`, 'error');
        setStatus(`🚨 ${result.alert}`);
      } else if (result.color_code === 'yellow') {
        showToast(`⚠ ${result.prediction}`, 'warning');
        setStatus(`⚠ ${result.alert}`);
      } else {
        showToast(`✅ ${result.prediction} (${(result.confidence * 100).toFixed(1)}%)`, 'success');
        setStatus(`✅ ${result.alert}`);
      }
    } catch (error) {
      showToast(`❌ MLP Prediction failed: ${error.message}`, 'error');
      setStatus(`❌ Prediction failed: ${error.message}`);
    } finally {
      setIsPredicting(false);
    }
  };

  // ============== RESET MODEL ==============
  const handleResetModel = async () => {
    if (!window.confirm('🚨 DELETE ALL data and models? This cannot be undone!')) return;

    setIsResetting(true);
    setStatus("🔄 Resetting model and data...");

    try {
      const result = await api.resetModel();

      setSampleCounts({});
      setMlpModelStatus({ trained: false, accuracy: 0 });
      setTrainingMetrics(null);
      setPrediction(null);
      setDatasetInfo(null);
      setValidatedEvents([]);

      const resetTime = result.reset_time?.slice(11, 19) || 'now';
      const deletedSamples = result.deleted?.samples || 0;

      showToast(`🚀 Reset complete! ${deletedSamples} samples deleted.`, 'success');
      setStatus(`✅ Reset at ${resetTime} (${deletedSamples} samples deleted)`);

      await fetchStatus();
    } catch (error) {
      showToast('❌ Reset failed!', 'error');
      setStatus(`❌ Reset failed: ${error.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  // ============== DATASET MANAGEMENT ==============
  const loadDatasetInfo = async () => {
    try {
      const result = await api.getDataset();
      setDatasetInfo(result);
    } catch (error) {
      setDatasetInfo(null);
      showToast('❌ Failed to load dataset info', 'error');
    }
  };

  const handleDeletePerson = async (name) => {
    if (!window.confirm(`🗑️ Delete all data for ${name}?`)) return;

    setIsDeleting(true);
    try {
      const result = await api.deletePerson(name);
      showToast(result.message || `✅ Deleted ${name}`, 'success');
      await loadDatasetInfo();
      await fetchStatus();
    } catch (error) {
      showToast(`❌ Delete failed: ${error.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (showDatasetManager) loadDatasetInfo();
  }, [showDatasetManager]);

  // ============== DATASET DOWNLOAD ==============
  const handleDownloadDataset = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/dataset/download?t=${Date.now()}`);
      if (!response.ok) {
        throw new Error('No dataset available');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `synapsense_dataset_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('✅ Dataset downloaded!', 'success');
    } catch (error) {
      showToast(`❌ Download failed: ${error.message}`, 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  // ============== DATASET UPLOAD ==============
  const handleUploadDataset = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      showToast('⚠ Please select a ZIP file', 'warning');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/dataset/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
      }

      const result = await response.json();
      showToast(`✅ Imported ${result.imported_samples} samples!`, 'success');
      setSampleCounts(result.samples_per_person || {});
      await loadDatasetInfo();
      await fetchStatus();
    } catch (error) {
      showToast(`❌ Upload failed: ${error.message}`, 'error');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // ============== INDIVIDUAL DATASET DOWNLOAD ==============
  const handleDownloadIndividualDataset = async (personName) => {
    setDownloadingPerson(personName);
    try {
      const blob = await api.downloadIndividualDataset(personName);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${personName}_dataset_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast(`✅ Downloaded ${personName} dataset!`, 'success');
    } catch (error) {
      showToast(`❌ Download failed: ${error.message}`, 'error');
    } finally {
      setDownloadingPerson(null);
    }
  };

  // ============== DATASET PREVIEW ==============
  const handlePreviewDataset = async (personName) => {
    setPreviewLoading(true);
    setShowDatasetPreview(true);
    setPreviewData(null);

    try {
      const result = await api.getDatasetPreview(personName, 50);
      setPreviewData(result);
    } catch (error) {
      showToast(`❌ Preview failed: ${error.message}`, 'error');
      setShowDatasetPreview(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  // ============== CHART DATA ==============
  // Build datasets array - base datasets first
  /* Chart Datasets */
  const chartDatasets = [
    {
      label: "Amplified Signal",
      data: amplifiedData.map(d => d.value),
      borderColor: "#00eaff",
      backgroundColor: "rgba(0,234,255,0.15)",
      borderWidth: 1.5,
      pointRadius: 0,
      fill: true,
      tension: 0.1,
      normalized: true,
      spanGaps: true
    },
    {
      label: "Captured Event",
      data: amplifiedData.map(d => d.isEvent ? d.value : null),
      borderColor: "#ff0055",
      backgroundColor: "rgba(255, 0, 85, 0.3)",
      borderWidth: 2,
      pointRadius: 0,
      fill: true,
      tension: 0.1,
      normalized: true,
      spanGaps: true
    }
  ];

  // Add manual capture highlight if active
  if (captureHighlight) {
    chartDatasets.push({
      label: `📸 Captured (${captureHighlight.samples} samples)`,
      data: amplifiedData.map((d, idx) => {
        if (idx >= captureHighlight.startIdx && idx < captureHighlight.endIdx) {
          return d.value;
        }
        return null;
      }),
      borderColor: "#fbbf24",
      backgroundColor: "rgba(251, 191, 36, 0.4)",
      borderWidth: 3,
      pointRadius: 0,
      fill: true,
      tension: 0.1,
      order: -1
    });
  }

  const amplifiedChartData = {
    labels: amplifiedData.map(d => d.time.toFixed(2)),
    datasets: chartDatasets
  };

  const fftChartData = {
    labels: fftData.frequencies.map(f => f.toFixed(0)),
    datasets: [{
      label: "FFT Magnitude",
      data: fftData.magnitudes,
      backgroundColor: "rgba(139,92,246,0.6)",
      borderColor: "#8b5cf6",
      borderWidth: 1
    }]
  };

  const lifChartData = {
    labels: lifData.map(d => d.time.toFixed(2)),
    datasets: [
      {
        label: "Membrane Potential",
        data: lifData.map(d => d.membrane),
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.15)",
        borderWidth: 1.5,
        pointRadius: 0,
        fill: true
      },
      {
        label: "Threshold",
        data: lifData.map(() => 0.025),
        borderColor: "#ef4444",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false
      }
    ]
  };

  // ============== RENDER ==============
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-6">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold flex gap-2 items-center">
          <Activity className="text-cyan-400" /> SynapSense Anomaly Detector
        </h1>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </div>
      </div>

      {/* SAVE LABEL SELECTOR + SETTINGS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* PERSON NAME INPUT + CLASS SELECTOR */}
        <div className={`bg-gray-800/50 p-4 rounded-xl border ${labelName.trim() ? (saveAsIntruder ? 'border-red-600' : 'border-green-600') : 'border-yellow-600'}`}>
          <label className="block text-sm text-gray-400 mb-2 font-semibold">
            👤 Person Name for Dataset: <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
              placeholder="Enter name (required)..."
              className={`flex-1 text-white bg-gray-700 p-3 rounded-lg border focus:outline-none ${labelName.trim() ? (saveAsIntruder ? 'border-red-600 focus:border-red-500' : 'border-green-600 focus:border-green-500') : 'border-yellow-600 focus:border-yellow-500'
                }`}
              onKeyPress={(e) => e.key === 'Enter' && labelName.trim() && showToast(`✅ Label: ${getEffectiveLabel()}`, 'success')}
            />
            <button
              onClick={() => labelName.trim() ? showToast(`✅ Label: ${getEffectiveLabel()}`, 'success') : showToast('⚠️ Enter a name first!', 'warning')}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-bold transition-all"
            >
              Set
            </button>
          </div>

          {/* HOME/INTRUDER Toggle */}
          <div className="flex items-center gap-4 mb-2 mt-3 p-2 bg-gray-900/50 rounded-lg">
            <span className="text-sm text-gray-400">Save as:</span>
            <button
              onClick={() => setSaveAsIntruder(false)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${!saveAsIntruder
                ? 'bg-green-600 text-white shadow-lg shadow-green-500/30'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
            >
              🏠 HOME
            </button>
            <button
              onClick={() => setSaveAsIntruder(true)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${saveAsIntruder
                ? 'bg-red-600 text-white shadow-lg shadow-red-500/30'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
            >
              🚨 INTRUDER
            </button>
          </div>

          <p className="text-xs text-gray-500">
            {labelName.trim()
              ? <>Saving as: <strong className={`text-base ${saveAsIntruder ? 'text-red-400' : 'text-green-400'}`}>{getEffectiveLabel()}</strong></>
              : <span className="text-yellow-400">⚠️ Name required to save samples</span>
            }
            <span className="ml-2 text-gray-600">• {saveAsIntruder ? 'Training INTRUDER detection' : 'Training HOME recognition'}</span>
          </p>
        </div>

        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
          <label className="block text-sm text-gray-400 mb-2">Capture Mode:</label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={manualCaptureMode}
                onChange={(e) => {
                  setManualCaptureMode(e.target.checked);
                  if (e.target.checked) setSaveAllVisibleMode(false);
                }}
                className="w-5 h-5 rounded bg-gray-700 border-gray-600"
              />
              <span className="text-sm font-semibold">📸 Manual Capture Mode</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAllVisibleMode}
                onChange={(e) => {
                  setSaveAllVisibleMode(e.target.checked);
                  if (e.target.checked) setManualCaptureMode(false);
                  visibleBufferRef.current = [];
                  showToast(e.target.checked ? '📊 Capturing all visible activity!' : '📊 Visible capture OFF', 'success');
                }}
                className="w-5 h-5 rounded bg-gray-700 border-gray-600"
              />
              <span className={`text-sm font-semibold ${saveAllVisibleMode ? 'text-cyan-400' : ''}`}>📊 Save All Visible (No Detection)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSaveEnabled}
                onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                className="w-5 h-5 rounded bg-gray-700 border-gray-600"
              />
              <span className="text-sm font-semibold text-green-400">💾 Auto Save Events</span>
            </label>
          </div>

          {/* Spike Threshold Slider for Save All Visible */}
          {saveAllVisibleMode && (
            <div className="mt-3 pt-3 border-t border-gray-600">
              <label className="block text-xs text-cyan-400 mb-1">Spike Threshold: {spikeThreshold.toFixed(1)}</label>
              <input
                type="range"
                min="0.1"
                max="2.0"
                step="0.1"
                value={spikeThreshold}
                onChange={(e) => setSpikeThreshold(parseFloat(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <div className="text-xs text-gray-500 mt-1">ADC Gate: {rawGate} | Spike: ≥{spikeThreshold}</div>
            </div>
          )}

          <p className="text-xs text-gray-500 mt-2">
            {saveAllVisibleMode
              ? `📊 Auto-capturing everything ≥${rawGate} ADC & ≥${spikeThreshold} filtered`
              : manualCaptureMode
                ? '📸 Click "Capture Now" when you see activity on the graph'
                : '🤖 Automatic threshold detection enabled'}
          </p>
        </div>
      </div>

      {/* MANUAL SAVE INFO */}
      {validatedEvents.length > 0 && (
        <div className="bg-gradient-to-r from-blue-900/50 to-cyan-900/50 p-4 rounded-xl border border-blue-700 mb-4">
          <div className="flex items-center gap-3">
            <Database className="w-6 text-cyan-400" />
            <div className="flex-1">
              <div className="font-bold text-lg">{validatedEvents.length} events collected</div>
              <div className="text-sm text-gray-300">Click "💾 Save Events" to store them as "{getEffectiveLabel()}"</div>
            </div>
            <div className="text-3xl font-bold text-cyan-400">{validatedEvents.length}</div>
          </div>
        </div>
      )}

      {/* DUAL DATASET STATUS PANEL */}
      <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 p-4 rounded-xl border border-indigo-700 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 text-indigo-400" />
            <span className="font-semibold">📊 Dataset Status ({dualDatasetStatus.total_samples || 0} Total Samples)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs ${modelsStatus[activeModel]?.trained ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              {modelsStatus[activeModel]?.short_name || 'Model'}: {modelsStatus[activeModel]?.trained ? `✓ ${(modelsStatus[activeModel]?.cv_accuracy || 0).toFixed(1)}%` : '⚠ Not Trained'}
            </span>
            <button onClick={fetchStatus} className="p-2 hover:bg-gray-700 rounded-lg transition">
              <RefreshCw className="w-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">Progress: {dualDatasetStatus.total_samples || 0} / {dualDatasetStatus.target_samples}</span>
            <span className={`font-bold ${dualDatasetStatus.progress_percent >= 100 ? 'text-green-400' : 'text-indigo-400'}`}>
              {dualDatasetStatus.progress_percent || 0}%
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${dualDatasetStatus.progress_percent >= 100 ? 'bg-green-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}
              style={{ width: `${Math.min(100, dualDatasetStatus.progress_percent || 0)}%` }}
            />
          </div>
        </div>

        {/* Individual Files Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(dualDatasetStatus.individual_files || []).map((file, idx) => (
            <div key={idx} className="p-3 rounded-lg bg-green-600/20 border border-green-500/30">
              <div className="text-xs text-green-400 mb-1">{file.name}</div>
              <div className="text-xl font-bold">{file.samples}</div>
              <div className="text-xs text-gray-400">samples</div>
            </div>
          ))}
          {(dualDatasetStatus.individual_files || []).length === 0 && (
            <div className="p-3 rounded-lg bg-gray-600/20 border border-gray-500/30 col-span-2">
              <div className="text-xs text-gray-400 mb-1">No Datasets</div>
              <div className="text-lg font-bold text-gray-500">0 samples</div>
              <div className="text-xs text-gray-500">Collect data to start</div>
            </div>
          )}
          <div className="p-3 rounded-lg bg-purple-600/20 border border-purple-500/30">
            <div className="text-xs text-purple-400 mb-1">Active Model</div>
            <div className={`text-lg font-bold ${modelsStatus[activeModel]?.trained ? 'text-green-400' : 'text-yellow-400'}`}>
              {modelsStatus[activeModel]?.trained ? '✅ Ready' : '⏳ Train'}
            </div>
            <div className="text-xs text-gray-400">{modelsStatus[activeModel]?.short_name || 'None'}</div>
          </div>
          <div className="p-3 rounded-lg bg-orange-600/20 border border-orange-500/30">
            <div className="text-xs text-orange-400 mb-1">Persons</div>
            <div className="text-xl font-bold">{(dualDatasetStatus.individual_files || []).length}</div>
            <div className="text-xs text-gray-400">datasets</div>
          </div>
        </div>

        {/* Recommendation */}
        <div className="mt-3 pt-3 border-t border-indigo-700">
          <div className="text-sm text-gray-300">
            {(dualDatasetStatus.total_samples || 0) < 5 && '💡 Collect at least 5 HOME samples to train a model'}
            {(dualDatasetStatus.total_samples || 0) >= 5 && !modelsStatus[activeModel]?.trained &&
              <span>💡 Ready to train! <button onClick={handleTrainMLP} className="ml-2 text-purple-400 underline hover:text-purple-300">Click to Train {modelsStatus[activeModel]?.short_name || 'Model'}</button></span>}
            {modelsStatus[activeModel]?.trained &&
              `🎯 ${modelsStatus[activeModel]?.short_name || 'Model'} trained with ${(modelsStatus[activeModel]?.cv_accuracy || 0).toFixed(1)}% accuracy. Ready for prediction!`}
          </div>
        </div>
      </div>

      {/* CONTROL BUTTONS */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={isConnected ? disconnectSerial : connectSerial}
          className={`px-5 py-3 rounded-xl flex gap-2 items-center font-semibold transition-all ${isConnected
            ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20'
            : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-lg shadow-cyan-500/20'
            }`}
        >
          <PlugZap className="w-5" />
          {isConnected ? "Disconnect" : "Connect Serial"}
        </button>

        {manualCaptureMode && isConnected && (
          <button
            onClick={handleManualCapture}
            className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 rounded-xl flex gap-2 items-center font-bold hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/30 animate-pulse"
          >
            <Eye className="w-5" />
            📸 Capture Now
          </button>
        )}

        {/* Capture Highlight Indicator */}
        {captureHighlight && (
          <div className="bg-yellow-500/20 border border-yellow-500 px-4 py-3 rounded-xl flex gap-2 items-center font-medium text-yellow-300 animate-pulse">
            <span className="text-lg">📸</span>
            <span>Captured {captureHighlight.samples} samples ({(captureHighlight.samples / 200 * 1000).toFixed(0)}ms) - shown in yellow on graph</span>
          </div>
        )}

        <button
          onClick={handleSaveTrainData}
          disabled={isSaving || validatedEvents.length === 0}
          className="bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-3 rounded-xl flex gap-2 items-center font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg shadow-green-500/30"
        >
          {isSaving ? <RefreshCw className="animate-spin w-5" /> : <Database className="w-5" />}
          💾 Save Events ({validatedEvents.length})
        </button>

        <button
          onClick={() => {
            setValidatedEvents([]);
            showToast('🗑️ Cleared all collected events', 'info');
          }}
          disabled={validatedEvents.length === 0}
          className="bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-xl flex gap-2 items-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Trash2 className="w-5" />
          Clear
        </button>

        {/* Predict Section with Model Selection */}
        <div className="flex items-center gap-2">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-white px-3 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {availableModels.filter(m => m.ready).map(model => (
              <option key={model.name} value={model.name}>
                {model.short_name} {model.trained ? `(${(model.cv_accuracy || 0).toFixed(1)}%)` : '(Not Trained)'}
              </option>
            ))}
          </select>
          <button
            onClick={handlePredictMLP}
            disabled={isPredicting || validatedEvents.length === 0 || !modelsStatus[selectedModel]?.trained}
            className="bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-3 rounded-xl flex gap-2 items-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-600 hover:to-blue-600 transition-all shadow-lg shadow-cyan-500/20"
            title={modelsStatus[selectedModel]?.trained ? `Predict with ${modelsStatus[selectedModel]?.short_name} (${(modelsStatus[selectedModel]?.cv_accuracy || 0).toFixed(1)}% accuracy)` : 'Model not trained'}
          >
            {isPredicting ? <RefreshCw className="animate-spin w-5" /> : <Zap className="w-5" />}
            🔮 Predict
          </button>
        </div>
      </div>

      {/* STATUS BAR */}
      <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="w-5 text-cyan-400" />
            <span className="font-medium">{status}</span>
          </div>
          <div className="flex items-center space-x-6 text-sm font-medium text-gray-400">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-blue-400" />
              <span>Dataset: {Object.values(sampleCounts).reduce((a, b) => a + b, 0)}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-green-400" />
              <span>Session: {detectionStats.totalSamples}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span>Events: {detectionStats.eventsDetected}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>Noise: {detectionStats.noiseRejected}</span>
            </div>
            {currentEventInfo && (
              <span className="text-yellow-400 animate-pulse">
                Recording: {currentEventInfo.length} samples
              </span>
            )}
          </div>
        </div>
      </div>

      {/* PREDICTION RESULT - Collapsible */}
      {prediction && prediction.formatted && (
        <div className={`mb-6 p-5 rounded-xl border-2 transition-all ${prediction.color_code === 'red'
          ? 'bg-red-900/50 border-red-500 shadow-lg shadow-red-500/30 animate-pulse'
          : prediction.color_code === 'green'
            ? 'bg-green-900/50 border-green-500 shadow-lg shadow-green-500/20'
            : 'bg-yellow-900/50 border-yellow-500 shadow-lg shadow-yellow-500/20'
          }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xl font-bold">
              {prediction.is_intruder ? '🚨 INTRUDER!' : prediction.confidence >= 0.5 ? '✅ FAMILY' : '⚠ UNCERTAIN'}
            </div>
            <div className="flex items-center gap-3">
              {prediction.alert && <span className="text-sm opacity-75">{prediction.alert}</span>}
              <button
                onClick={() => setPrediction(null)}
                className="p-2 hover:bg-gray-700/50 rounded-lg transition text-gray-400 hover:text-white"
                title="Close prediction"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="text-4xl font-bold mb-2">{prediction.formatted.person}</div>
          <div className="text-xl mb-2">Confidence: {prediction.formatted.confidenceDisplay}</div>

          {/* Enhanced Scoring Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm bg-gray-900/50 rounded-lg p-3">
            <div className="text-center">
              <div className="text-gray-400">Anomaly Score</div>
              <div className={`font-bold ${prediction.anomaly_score > prediction.threshold ? 'text-red-400' : 'text-green-400'}`}>
                {prediction.anomaly_score?.toFixed(3) ?? 'N/A'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Threshold</div>
              <div className="font-bold text-blue-400">{prediction.threshold?.toFixed(3) ?? 'N/A'}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Confidence Band</div>
              <div className={`font-bold ${prediction.confidence_band === 'high' ? 'text-green-400' :
                prediction.confidence_band === 'medium' ? 'text-yellow-400' : 'text-orange-400'
                }`}>
                {prediction.confidence_band?.toUpperCase() ?? 'N/A'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Model Agreement</div>
              <div className={`font-bold ${prediction.svm_agrees ? 'text-green-400' : prediction.svm_agrees === false ? 'text-yellow-400' : 'text-gray-400'}`}>
                {prediction.svm_agrees === true ? '✓ Confirmed' : prediction.svm_agrees === false ? '⚠ Uncertain' : 'N/A'}
              </div>
            </div>
          </div>

          {prediction.probabilities && (
            <div className="space-y-2">
              {Object.entries(prediction.probabilities)
                .sort((a, b) => b[1] - a[1])
                .map(([name, prob]) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="w-24 text-sm">{name}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${name === 'INTRUDER'
                          ? 'bg-gradient-to-r from-red-500 to-red-400'
                          : 'bg-gradient-to-r from-green-400 to-emerald-500'
                          }`}
                        style={{ width: `${prob * 100}%` }}
                      />
                    </div>
                    <span className="text-sm w-14 text-right">{(prob * 100).toFixed(1)}%</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TRAINING METRICS */}
      {trainingMetrics && (
        <div className="mb-6 p-4 bg-gradient-to-r from-green-900/50 to-emerald-900/50 rounded-xl border border-green-700">
          <div className="font-bold mb-2 flex items-center gap-2">
            <TrendingUp className="w-5" /> Training Results
          </div>
          <div className="text-sm">{formatMetrics(trainingMetrics)}</div>
        </div>
      )}

      {/* VISUALIZATION GRAPHS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Amplified Signal */}
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-5 text-cyan-400" />
            <span className="font-semibold">Amplified Vibration Signal</span>
          </div>
          <div className="h-48">
            <Line data={amplifiedChartData} options={chartOptions} key={isConnected ? 'connected' : 'disconnected'} />
          </div>
        </div>

        {/* FFT */}
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 text-purple-400" />
            <span className="font-semibold">FFT Spectrum (Last Event)</span>
          </div>
          <div className="h-48">
            {fftData.frequencies.length > 0 ? (
              <Bar data={fftChartData} options={fftChartOptions} />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                Waiting for footstep event...
              </div>
            )}
          </div>
        </div>

        {/* LIF Neuron */}
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 text-green-400" />
            <span className="font-semibold">LIF Neuron Model (Membrane Potential)</span>
            <span className="text-xs text-gray-400 ml-auto">
              Spikes: {spikeMarkers.length} | Rate: {lifNeuronRef.current?.getSpikeRate().toFixed(1) || 0} Hz
            </span>
          </div>
          <div className="h-40">
            <Line data={lifChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* ============== MULTI-MODEL TRAINING CENTER ============== */}
      <div className="bg-gradient-to-br from-purple-900/40 to-indigo-900/40 p-5 rounded-xl border border-purple-700/50 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BrainCircuit className="w-6 text-purple-400" />
            <div>
              <h3 className="text-lg font-bold">🧠 Model Training Center</h3>
              <p className="text-sm text-gray-400">Select model type, datasets, and train with K-Fold Cross-Validation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Active Model Status */}
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${modelsStatus[activeModel]?.trained
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
              }`}>
              Active: {modelsStatus[activeModel]?.short_name || 'MLP'}
              {modelsStatus[activeModel]?.trained ? ` (${modelsStatus[activeModel]?.cv_accuracy || 0}%)` : ' - Not Trained'}
            </div>
          </div>
        </div>

        {/* Model Selector Dropdown */}
        <div className="mb-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-300">🎯 Select Model Type</span>
            <span className="text-xs text-gray-500">Choose the ML model to train</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {availableModels.map((model) => (
              <button
                key={model.name}
                onClick={() => setSelectedModel(model.name)}
                disabled={!model.ready}
                className={`p-3 rounded-lg border-2 transition-all text-left ${selectedModel === model.name
                  ? 'bg-purple-600/30 border-purple-500 shadow-lg shadow-purple-500/20'
                  : model.ready
                    ? 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                    : 'bg-gray-800/30 border-gray-700 opacity-50 cursor-not-allowed'
                  }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm">{model.short_name}</span>
                  {model.trained && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                      {model.cv_accuracy}%
                    </span>
                  )}
                  {!model.ready && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">
                      Soon
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">{model.description}</p>
                {model.is_active && (
                  <div className="mt-2 text-xs text-cyan-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Active for predictions
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Quick Model Info */}
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>Selected: <span className="text-purple-400 font-medium">{modelsStatus[selectedModel]?.display_name || selectedModel}</span></span>
            {modelsStatus[selectedModel]?.trained && (
              <button
                onClick={() => handleSetActiveModel(selectedModel)}
                disabled={activeModel === selectedModel}
                className={`px-2 py-1 rounded transition ${activeModel === selectedModel
                  ? 'bg-green-600/20 text-green-400 cursor-default'
                  : 'bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300'
                  }`}
              >
                {activeModel === selectedModel ? '✓ Active' : '→ Set as Active'}
              </button>
            )}
          </div>
        </div>

        {/* Dataset Selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-300">📁 Select Datasets for Training</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedDatasets(availableDatasets)}
                className="text-xs bg-purple-600/30 hover:bg-purple-600/50 px-2 py-1 rounded transition"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedDatasets([])}
                className="text-xs bg-gray-600/30 hover:bg-gray-600/50 px-2 py-1 rounded transition"
              >
                Clear All
              </button>
            </div>
          </div>

          {availableDatasets.length > 0 ? (
            <div className="flex flex-wrap gap-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
              {availableDatasets.map((dataset) => {
                const isSelected = selectedDatasets.includes(dataset);
                const datasetInfo = dualDatasetStatus.home_csv?.persons_details?.[dataset] || {};
                const sampleCount = Object.entries(sampleCounts).find(([k]) => k === dataset)?.[1] || 0;

                return (
                  <button
                    key={dataset}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDatasets(selectedDatasets.filter(d => d !== dataset));
                      } else {
                        setSelectedDatasets([...selectedDatasets, dataset]);
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${isSelected
                      ? 'bg-purple-600/40 border-purple-500 text-purple-200 shadow-lg shadow-purple-500/20'
                      : 'bg-gray-700/40 border-gray-600 text-gray-300 hover:bg-gray-700/60'
                      }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-purple-500 border-purple-400' : 'border-gray-500'
                      }`}>
                      {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <User className="w-4 h-4" />
                    <span className="font-medium">{dataset}</span>
                    <span className="text-xs bg-gray-600/60 px-2 py-0.5 rounded">
                      {sampleCount} samples
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-center text-gray-400">
              No datasets available. Save some footstep events first!
            </div>
          )}

          <div className="mt-2 text-xs text-gray-500">
            Selected: {selectedDatasets.length} of {availableDatasets.length} datasets
            ({selectedDatasets.length > 0 ? selectedDatasets.join(', ') : 'None'})
          </div>
        </div>

        {/* Training Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleTrainModel}
            disabled={isTraining || selectedDatasets.length === 0 || !modelsStatus[selectedModel]?.ready}
            className="bg-gradient-to-r from-purple-500 to-indigo-500 px-6 py-3 rounded-xl flex gap-2 items-center font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-600 hover:to-indigo-600 transition-all shadow-lg shadow-purple-500/30"
          >
            {isTraining ? (
              <>
                <RefreshCw className="animate-spin w-5" />
                Training {modelsStatus[selectedModel]?.short_name || 'Model'}...
              </>
            ) : (
              <>
                <BrainCircuit className="w-5" />
                🧠 Train {modelsStatus[selectedModel]?.short_name || 'Model'}
              </>
            )}
          </button>

          {/* Predict with Active Model */}
          <button
            onClick={handlePredictWithModel}
            disabled={isPredicting || validatedEvents.length === 0 || !modelsStatus[activeModel]?.trained}
            className="bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-3 rounded-xl flex gap-2 items-center font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-600 hover:to-blue-600 transition-all shadow-lg shadow-cyan-500/30"
          >
            {isPredicting ? (
              <>
                <RefreshCw className="animate-spin w-5" />
                Predicting...
              </>
            ) : (
              <>
                <Zap className="w-5" />
                🔮 Predict ({modelsStatus[activeModel]?.short_name || 'MLP'})
              </>
            )}
          </button>

          {trainingDetails && (
            <button
              onClick={() => setShowTrainingDetails(!showTrainingDetails)}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-xl flex gap-2 items-center transition"
            >
              {showTrainingDetails ? <EyeOff className="w-5" /> : <Eye className="w-5" />}
              {showTrainingDetails ? 'Hide' : 'Show'} Details
            </button>
          )}

          <div className="ml-auto text-sm text-gray-400">
            {selectedDatasets.length === 0
              ? '⚠️ Select at least one dataset'
              : `Ready to train ${modelsStatus[selectedModel]?.short_name || 'model'} on ${selectedDatasets.length} dataset(s)`}
          </div>
        </div>

        {/* Models Status Summary */}
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <div className="text-xs text-gray-500 mb-2">📊 Models Overview:</div>
          <div className="flex flex-wrap gap-2">
            {availableModels.map((model) => (
              <div
                key={model.name}
                className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 ${model.trained
                  ? model.is_active
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'bg-green-500/20 text-green-300 border border-green-500/30'
                  : 'bg-gray-700/30 text-gray-400 border border-gray-600/30'
                  }`}
              >
                <span className="font-medium">{model.short_name}</span>
                {model.trained ? (
                  <span>{model.cv_accuracy}%</span>
                ) : model.ready ? (
                  <span>Not trained</span>
                ) : (
                  <span>Coming soon</span>
                )}
                {model.is_active && <span className="text-cyan-400">★</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DETAILED TRAINING RESULTS PANEL */}
      {showTrainingDetails && trainingDetails && (
        <div className="mb-6 p-4 bg-gradient-to-br from-indigo-900/60 to-purple-900/60 rounded-xl border border-indigo-600 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-lg flex items-center gap-2">
              <Brain className="w-5 text-indigo-400" />
              {trainingDetails.modelDisplayName || 'Model'} Training Report
            </div>
            <button
              onClick={() => setShowTrainingDetails(false)}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Model Badge */}
          {trainingDetails.modelName && (
            <div className="mb-3">
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-600/40 text-purple-200 border border-purple-500/30">
                {trainingDetails.modelName}
              </span>
            </div>
          )}

          {/* Accuracy Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-gray-800/60 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-400">{trainingDetails.accuracy}%</div>
              <div className="text-xs text-gray-400">Final Accuracy</div>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-400">
                {trainingDetails.cvAccuracy ?? 'N/A'}%
              </div>
              <div className="text-xs text-gray-400">CV Accuracy</div>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-yellow-400">±{trainingDetails.cvStd ?? 0}%</div>
              <div className="text-xs text-gray-400">Std Dev</div>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-400">{trainingDetails.nFolds}</div>
              <div className="text-xs text-gray-400">Folds</div>
            </div>
          </div>

          {/* Cross-Validation Scores */}
          {trainingDetails.cvScores?.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-semibold text-gray-300 mb-2">
                📊 Cross-Validation Fold Scores
              </div>
              <div className="flex flex-wrap gap-2">
                {trainingDetails.cvScores.map((score, idx) => (
                  <div
                    key={idx}
                    className={`px-3 py-1 rounded-full text-sm font-medium ${score >= 90 ? 'bg-green-600/40 text-green-300' :
                      score >= 80 ? 'bg-yellow-600/40 text-yellow-300' :
                        'bg-red-600/40 text-red-300'
                      }`}
                  >
                    Fold {idx + 1}: {score}%
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sample Distribution */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-800/60 rounded-lg p-3">
              <div className="text-lg font-bold text-cyan-400">{trainingDetails.homeSamples}</div>
              <div className="text-xs text-gray-400">HOME Samples</div>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3">
              <div className="text-lg font-bold text-orange-400">{trainingDetails.intruderSamples}</div>
              <div className="text-xs text-gray-400">INTRUDER (Synthetic)</div>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3">
              <div className="text-lg font-bold text-white">{trainingDetails.totalSamples}</div>
              <div className="text-xs text-gray-400">Total Samples</div>
            </div>
          </div>

          {/* Datasets Used */}
          {trainingDetails.datasets?.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-gray-300 mb-2">
                📁 Datasets Used for Training
              </div>
              <div className="bg-gray-800/60 rounded-lg p-3">
                <div className="flex flex-wrap gap-2">
                  {trainingDetails.datasets.map((dataset, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-700/60 rounded-lg border border-gray-600"
                    >
                      <User className="w-4 h-4 text-emerald-400" />
                      <span className="font-medium text-emerald-300">{dataset.name}</span>
                      <span className="text-xs text-gray-400 bg-gray-600/60 px-2 py-0.5 rounded">
                        {dataset.samples} samples
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Total {trainingDetails.datasets.length} dataset(s) •
                  {trainingDetails.datasetNames?.join(', ')}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RESET & DATASET MANAGER */}
      <div className="bg-gray-800/50 p-4 rounded-xl border border-red-900/30 mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <button
            onClick={handleResetModel}
            disabled={isResetting}
            className="bg-gradient-to-r from-red-500 to-red-700 px-6 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-transform disabled:opacity-50 flex items-center gap-2"
            style={{ boxShadow: '0 4px 15px rgba(255, 68, 68, 0.3)' }}
          >
            {isResetting ? <RefreshCw className="animate-spin w-5" /> : <RotateCcw className="w-5" />}
            🚀 Reset All
          </button>

          <button
            onClick={() => setShowDatasetManager(!showDatasetManager)}
            className="bg-gray-700 px-5 py-3 rounded-xl flex gap-2 items-center hover:bg-gray-600 transition"
          >
            <Table className="w-5" />
            {showDatasetManager ? 'Hide' : 'Show'} Dataset Manager
          </button>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="bg-gray-700 px-5 py-3 rounded-xl flex gap-2 items-center hover:bg-gray-600 transition ml-auto"
          >
            <Settings className="w-5" />
            {showAdvanced ? <EyeOff className="w-4" /> : <Eye className="w-4" />}
          </button>
        </div>

        {/* Dataset Manager Panel */}
        {showDatasetManager && (
          <div className="bg-gray-900/50 p-4 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Database className="w-5" /> Dataset Manager
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadDataset}
                  disabled={isDownloading}
                  className="text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  {isDownloading ? <RefreshCw className="w-4 animate-spin" /> : '⬇️'} Download
                </button>
                <label className="text-sm bg-green-600 hover:bg-green-700 px-3 py-1 rounded-lg flex items-center gap-1 cursor-pointer">
                  {isUploading ? <RefreshCw className="w-4 animate-spin" /> : '⬆️'} Upload
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".zip"
                    onChange={handleUploadDataset}
                    className="hidden"
                  />
                </label>
                <button onClick={loadDatasetInfo} className="text-sm bg-gray-700 px-3 py-1 rounded-lg hover:bg-gray-600 flex items-center gap-1">
                  <RefreshCw className="w-4" /> Refresh
                </button>
              </div>
            </div>

            {datasetInfo ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left p-3 text-gray-400">Class</th>
                        <th className="text-left p-3 text-gray-400">Type</th>
                        <th className="text-left p-3 text-gray-400">Samples</th>
                        <th className="text-left p-3 text-gray-400">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datasetInfo.persons?.map((person) => {
                        // All HOME_ prefixed datasets are HOME class (green)
                        const isHome = person.name.toUpperCase().startsWith('HOME');
                        return (
                          <tr key={person.name} className="border-b border-gray-800 hover:bg-gray-800/50">
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded text-sm ${isHome ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {isHome ? '🏠' : '🚨'} {person.name}
                              </span>
                            </td>
                            <td className="p-3 text-gray-400">{person.type || (isHome ? 'HOME' : 'UNKNOWN')}</td>
                            <td className="p-3 font-bold">{person.samples}</td>
                            <td className="p-3">
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={() => handlePreviewDataset(person.name)}
                                  disabled={person.samples === 0}
                                  className="bg-cyan-500 hover:bg-cyan-600 px-3 py-1 rounded-full text-sm flex items-center gap-1 disabled:opacity-50 transition"
                                  title="View dataset samples and statistics"
                                >
                                  <Table className="w-4" /> View Data
                                </button>
                                <button
                                  onClick={() => {
                                    setVizSource(person.name);
                                    setVizSampleId(null);
                                    setShowVisualization(true);
                                  }}
                                  disabled={person.samples === 0}
                                  className="bg-purple-500 hover:bg-purple-600 px-3 py-1 rounded-full text-sm flex items-center gap-1 disabled:opacity-50 transition"
                                  title="View Signal & Wavelet Visualization"
                                >
                                  <Waves className="w-4" /> Visualize
                                </button>
                                <button
                                  onClick={() => handleDownloadIndividualDataset(person.name)}
                                  disabled={downloadingPerson === person.name || person.samples === 0}
                                  className="bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded-full text-sm flex items-center gap-1 disabled:opacity-50 transition"
                                  title="Download this person's dataset as ZIP"
                                >
                                  {downloadingPerson === person.name ? <RefreshCw className="w-4 animate-spin" /> : <Download className="w-4" />}
                                  Download
                                </button>
                                <button
                                  onClick={() => handleDeletePerson(person.name)}
                                  disabled={isDeleting || person.samples === 0}
                                  className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded-full text-sm flex items-center gap-1 disabled:opacity-50 transition"
                                >
                                  <Trash2 className="w-4" /> Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 text-sm text-gray-400 flex flex-wrap gap-4">
                  <span>📊 Total: <strong className="text-white">{datasetInfo.total_samples || 0}</strong> samples</span>
                  <span>🤖 Model: <strong className={datasetInfo.model_status === 'trained' ? 'text-green-400' : 'text-yellow-400'}>
                    {datasetInfo.model_status || 'not trained'}
                  </strong></span>
                  {datasetInfo.model_accuracy != null && !isNaN(datasetInfo.model_accuracy) && (
                    <span>🎯 Accuracy: <strong className="text-cyan-400">{datasetInfo.model_accuracy.toFixed(1)}%</strong></span>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500 py-4">Loading...</div>
            )}
          </div>
        )}

        {/* Advanced Settings Panel */}
        {showAdvanced && (
          <div className="bg-gray-900/50 p-4 rounded-xl mt-4">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Settings className="w-5" /> Detection Parameters
            </h3>

            {/* Sensitivity Presets */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Sensitivity Preset:</label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(SENSITIVITY_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => handleSensitivityChange(key)}
                    title={preset.description}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${sensitivity === key
                      ? 'bg-cyan-600 text-white shadow-lg'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                  >
                    {preset.name}
                  </button>
                ))}
                <button
                  onClick={() => setSensitivity('custom')}
                  title="Custom threshold"
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${sensitivity === 'custom'
                    ? 'bg-purple-600 text-white shadow-lg'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                  🔧 Custom
                </button>
              </div>
              {/* Show selected preset description */}
              {sensitivity !== 'custom' && SENSITIVITY_PRESETS[sensitivity] && (
                <p className="text-xs text-gray-500 mt-2">
                  {SENSITIVITY_PRESETS[sensitivity].description}
                </p>
              )}
            </div>

            {/* Simple Sensitivity Slider */}
            <div className="mb-4 p-3 bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">🎚️ Spike Multiplier (vs recent noise):</label>
                <span className="text-cyan-400 font-bold">{customThreshold.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="6.0"
                step="0.1"
                value={customThreshold}
                onChange={(e) => handleCustomThresholdChange(e.target.value)}
                className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>🔊 Ultra Sensitive (0.2x)</span>
                <span>🔇 Strict (6x)</span>
              </div>
              <p className="text-xs text-green-400 mt-2">
                💡 Spike must be this many times larger than recent activity. Higher = rejects more noise.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={lowerThresholdEightyPercent}
                  className="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-sm"
                >
                  ⬇️ Reduce by 80%
                </button>
              </div>
            </div>

            {/* Raw Amplitude Gate (ADC) */}
            <div className="mb-4 p-3 bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">🧱 Raw Amplitude Gate (ADC):</label>
                <span className="text-emerald-400 font-bold">{rawGate} ADC</span>
              </div>
              <input
                type="range"
                min="0"
                max="2000"
                step="10"
                value={rawGate}
                onChange={(e) => handleRawGateChange(e.target.value)}
                className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Off/Low</span>
                <span>Strict</span>
              </div>
              <p className="text-xs text-emerald-400 mt-2">
                💡 Below this |raw-baseline| is treated as noise (zeroed, no trigger). Lower to allow quieter steps.
              </p>
            </div>

            {/* Simplified ML Confidence */}
            <div className="mb-4 p-3 bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">🎯 Min Confidence for HOME:</label>
                <span className="text-purple-400 font-bold">{(confidenceThreshold * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.3"
                max="0.95"
                step="0.05"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Lenient</span>
                <span>Strict</span>
              </div>
            </div>

            {/* Current Detection Parameters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-gray-800 p-3 rounded-lg">
                <div className="text-gray-400">Spike Mult</div>
                <div className="font-bold text-cyan-400">{DETECTION_CONFIG.SPIKE_MULTIPLIER}x</div>
              </div>
              <div className="bg-gray-800 p-3 rounded-lg">
                <div className="text-gray-400">Min Spike</div>
                <div className="font-bold">{DETECTION_CONFIG.MIN_ABSOLUTE_SPIKE} ADC</div>
              </div>
              <div className="bg-gray-800 p-3 rounded-lg">
                <div className="text-gray-400">Min Peak</div>
                <div className="font-bold">{DETECTION_CONFIG.MIN_PEAK_HEIGHT} ADC</div>
              </div>
              <div className="bg-gray-800 p-3 rounded-lg">
                <div className="text-gray-400">Gain</div>
                <div className="font-bold">{DETECTION_CONFIG.GAIN}x</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AUDIO */}
      <audio ref={alarmRef} src="/alarm.mp3" preload="auto" />

      {/* SIGNAL & WAVELET VISUALIZATION MODAL */}
      <SignalVisualization
        isOpen={showVisualization}
        onClose={() => setShowVisualization(false)}
        initialSource={vizSource}
        initialSampleId={vizSampleId}
      />

      {/* DATASET PREVIEW MODAL */}
      {showDatasetPreview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800/50">
              <div className="flex items-center gap-3">
                <Database className="w-6 text-cyan-400" />
                <div>
                  <h2 className="text-xl font-bold">{previewData?.person || 'Loading...'} Dataset</h2>
                  <p className="text-sm text-gray-400">
                    {previewData ? `${previewData.total_samples} samples • ${previewData.waveform_count || 0} waveforms` : 'Loading...'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {previewData && (
                  <button
                    onClick={() => handleDownloadIndividualDataset(previewData.person)}
                    disabled={downloadingPerson === previewData.person}
                    className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition disabled:opacity-50"
                  >
                    {downloadingPerson === previewData.person ? (
                      <RefreshCw className="w-4 animate-spin" />
                    ) : (
                      <Download className="w-4" />
                    )}
                    Download ZIP
                  </button>
                )}
                <button
                  onClick={() => setShowDatasetPreview(false)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition text-gray-400 hover:text-white"
                >
                  <X className="w-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4">
              {previewLoading ? (
                <div className="flex items-center justify-center h-64">
                  <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                  <span className="ml-3 text-gray-400">Loading dataset preview...</span>
                </div>
              ) : previewData ? (
                <div className="space-y-6">
                  {/* Feature Statistics */}
                  {previewData.feature_stats && Object.keys(previewData.feature_stats).length > 0 && (
                    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                      <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                        <TrendingUp className="w-5 text-purple-400" />
                        Feature Statistics (Top 10)
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-700 text-gray-400">
                              <th className="text-left p-2">Feature</th>
                              <th className="text-right p-2">Mean</th>
                              <th className="text-right p-2">Std</th>
                              <th className="text-right p-2">Min</th>
                              <th className="text-right p-2">Max</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(previewData.feature_stats).slice(0, 10).map(([feature, stats]) => (
                              <tr key={feature} className="border-b border-gray-800 hover:bg-gray-700/30">
                                <td className="p-2 font-medium text-cyan-300">{feature}</td>
                                <td className="p-2 text-right">{stats?.mean?.toFixed(4) ?? 'N/A'}</td>
                                <td className="p-2 text-right text-gray-400">{stats?.std?.toFixed(4) ?? 'N/A'}</td>
                                <td className="p-2 text-right text-green-400">{stats?.min?.toFixed(4) ?? 'N/A'}</td>
                                <td className="p-2 text-right text-red-400">{stats?.max?.toFixed(4) ?? 'N/A'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Recent Samples Table */}
                  <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                      <Table className="w-5 text-cyan-400" />
                      Recent Samples ({previewData.samples?.length || 0} of {previewData.total_samples})
                    </h3>
                    {previewData.samples && previewData.samples.length > 0 ? (
                      <div className="overflow-x-auto max-h-80">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-gray-800">
                            <tr className="border-b border-gray-700 text-gray-400">
                              <th className="text-left p-2">#</th>
                              <th className="text-left p-2">Timestamp</th>
                              <th className="text-right p-2">RMS</th>
                              <th className="text-right p-2">Energy</th>
                              <th className="text-right p-2">Dominant Freq</th>
                              <th className="text-right p-2">Spike Count</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewData.samples.map((sample, idx) => (
                              <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-700/30">
                                <td className="p-2 text-gray-500">{sample.sample_index ?? idx}</td>
                                <td className="p-2 text-gray-300">{sample._timestamp || sample.timestamp || 'N/A'}</td>
                                <td className="p-2 text-right text-cyan-300">{sample.stat_rms?.toFixed(4) ?? 'N/A'}</td>
                                <td className="p-2 text-right text-purple-300">{sample.stat_energy?.toFixed(4) ?? 'N/A'}</td>
                                <td className="p-2 text-right text-yellow-300">{sample.fft_dominant_freq?.toFixed(2) ?? 'N/A'} Hz</td>
                                <td className="p-2 text-right text-green-300">{sample.spike_count ?? 'N/A'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        No samples available for preview
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  {previewData.file_info && (
                    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                      <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                        <Database className="w-5 text-green-400" />
                        File Information
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-700/30 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-1">CSV Path</div>
                          <div className="font-medium text-sm truncate" title={previewData.file_info.features_csv?.path}>
                            {previewData.file_info.features_csv?.path?.split('/').pop() || 'N/A'}
                          </div>
                        </div>
                        <div className="bg-gray-700/30 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-1">File Size</div>
                          <div className="font-medium">{previewData.file_info.features_csv?.size_kb || 0} KB</div>
                        </div>
                        <div className="bg-gray-700/30 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-1">Waveforms</div>
                          <div className="font-medium">{previewData.waveform_count || 0}</div>
                        </div>
                        <div className="bg-gray-700/30 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-1">Columns</div>
                          <div className="font-medium">{previewData.file_info.features_csv?.columns?.length || 0}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  No data available
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATIONS */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className={`px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 cursor-pointer transition-all hover:scale-105 animate-slide-in ${toast.type === 'error' ? 'bg-red-600' :
              toast.type === 'warning' ? 'bg-yellow-600' : 'bg-green-600'
              }`}
          >
            <span>{toast.message}</span>
            <button className="ml-2 opacity-70 hover:opacity-100">✕</button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>
    </div>
  );
}

export default Vibrations;
