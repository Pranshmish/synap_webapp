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
} from "lucide-react";

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
  value: "HOME",
  label: "🏠 HOME Training",
  color: "from-green-500 to-emerald-500",
  description: "Train on HOME samples only. Intruders detected as anomalies."
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
  // Anomaly Detection: Train on HOME, optionally add INTRUDER for binary fallback
  const [saveLabel, setSaveLabel] = useState("HOME"); // HOME or INTRUDER
  const [labelName, setLabelName] = useState(""); // Custom sub-label name
  const [status, setStatus] = useState("Idle — Connect serial to begin");
  const [prediction, setPrediction] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sampleCounts, setSampleCounts] = useState({});
  const [modelTrained, setModelTrained] = useState(false);
  const [trainingMetrics, setTrainingMetrics] = useState(null);

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

  // ============== SIGNAL DATA ==============
  const [amplifiedData, setAmplifiedData] = useState([]);
  const [fftData, setFftData] = useState({ frequencies: [], magnitudes: [] });
  const [lifData, setLifData] = useState([]);
  const [spikeMarkers, setSpikeMarkers] = useState([]);

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

  // ============== SENSITIVITY/THRESHOLD ==============
  const [sensitivity, setSensitivity] = useState('medium');
  const [customThreshold, setCustomThreshold] = useState(2.0); // Default: adaptive threshold multiplier
  const [rawGate, setRawGate] = useState(DETECTION_CONFIG.RAW_DELTA_GATE_ADC || 0);

  // ============== ML THRESHOLD OVERRIDE ==============
  const [mlThresholdOverride, setMlThresholdOverride] = useState(null); // null = use model default
  const [customMlThreshold, setCustomMlThreshold] = useState(0.0);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.45); // Min confidence for HOME

  // ============== TOASTS ==============
  const [toasts, setToasts] = useState([]);

  // ============== REFS ==============
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const stopRef = useRef(false);
  const alarmRef = useRef(null);
  const detectorRef = useRef(null);
  const lifNeuronRef = useRef(null);
  const lastSaveTimeRef = useRef(0);
  const lineBufferRef = useRef("");

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
          // Decrease MIN_RMS slightly with lower thresholds, within safe bounds
          MIN_RMS_RAW: Math.max(0.005, Math.min(0.06, 0.02 * threshold))
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
        MIN_RMS_RAW: Math.max(0.005, Math.min(0.06, 0.02 * newVal))
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

  // ============== FETCH STATUS ON MOUNT ==============
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // ============== CLEANUP ==============
  useEffect(() => {
    return () => {
      stopRef.current = true;
      readerRef.current?.cancel().catch(() => { });
      portRef.current?.close().catch(() => { });
    };
  }, []);

  // ============== API: FETCH STATUS ==============
  const fetchStatus = async () => {
    try {
      const result = await api.getStatus();
      setSampleCounts(result.samples_per_person || {});
      setModelTrained(result.model_status === 'Ready');
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  };

  // ============== SERIAL: CONNECT ==============
  const connectSerial = async () => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: BUFFER_CONFIG.BAUD_RATE });

      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable);
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

      readLoop(reader);
    } catch (err) {
      setStatus("❌ Failed to connect to serial port");
      showToast("❌ Serial connection failed", "error");
    }
  };

  // ============== SERIAL: DISCONNECT ==============
  const disconnectSerial = async () => {
    stopRef.current = true;
    await readerRef.current?.cancel().catch(() => { });
    await portRef.current?.close().catch(() => { });
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

  // ============== PROCESS SERIAL LINE ==============
  const processSerialLine = (line) => {
    if (!line) return;

    // Parse ESP32 formats robustly: "Raw:1958", "Raw: 1958", "raw=1958", or just a number
    let rawValue;
    const rawMatch = line.match(/Raw\s*[:=]?\s*(\d{1,4})/i);
    if (rawMatch) {
      rawValue = parseInt(rawMatch[1], 10);
    } else {
      // Fallback: first integer on the line
      const anyNum = line.match(/\b(\d{1,4})\b/);
      rawValue = anyNum ? parseInt(anyNum[1], 10) : NaN;
    }

    if (isNaN(rawValue) || rawValue < 0 || rawValue > 4095) return;

    // Process through detector
    const detector = detectorRef.current;
    if (!detector) return;

    const result = detector.processSample(rawValue);
    const timestamp = performance.now() / 1000;

    // Update detection stats
    setDetectionStats(prev => ({
      ...prev,
      totalSamples: prev.totalSamples + 1
    }));

    // Update amplified signal graph
    setAmplifiedData(prev => {
      const newData = [...prev, { time: timestamp, value: result.filtered }];
      return newData.slice(-500); // Keep last 500 points
    });

    // Process through LIF neuron
    const lif = lifNeuronRef.current;
    if (lif && !result.isWarmup) {
      const normalizedInput = Math.abs(result.filtered) / 500; // Normalize
      const lifResult = lif.step(normalizedInput);

      setLifData(prev => {
        const newData = [...prev, { time: timestamp, membrane: lifResult.membrane }];
        return newData.slice(-500);
      });

      if (lifResult.spiked) {
        setSpikeMarkers(prev => {
          const newMarkers = [...prev, { time: timestamp, value: lifResult.membrane }];
          return newMarkers.slice(-50);
        });
      }
    }

    // Update status during warmup
    if (result.isWarmup) {
      const progress = result.warmupProgress ? (result.warmupProgress * 100).toFixed(0) : '...';
      setStatus(`🔄 Warming up noise floor... ${progress}%`);
      return;
    }

    // Update current event info
    if (result.eventActive) {
      setCurrentEventInfo({
        length: result.eventLength,
        energy: result.energy,
        threshold: result.threshold,
        noiseFloor: result.noiseFloor
      });
      setStatus(`📊 Capturing: ${result.eventLength} samples, energy=${result.energy?.toFixed(4) || '?'}`);
    } else {
      setCurrentEventInfo(null);
      if (!result.event) {
        // Show energy-based status with noise floor
        const energyRatio = result.energy / Math.max(result.threshold, 0.001);
        setStatus(`🟢 Noise: ${result.noiseFloor?.toFixed(4) || '?'} | Thresh: ${result.threshold?.toFixed(4) || '?'} | Energy: ${result.energy?.toFixed(4) || '?'} (${(energyRatio * 100).toFixed(0)}%)`);
      }
    }

    // Handle detected event (could be valid footstep or rejected noise)
    if (result.event) {
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

  // ============== HANDLE VALIDATED EVENT ==============
  const handleValidatedEvent = async (event) => {
    // CRITICAL: Block noise from being saved as training data
    if (event.isNoise || event.rejected) {
      console.log('⛔ Blocked noise event from being processed');
      return;
    }

    // Update FFT display
    setFftData({
      frequencies: event.frequencies.slice(0, 50),
      magnitudes: event.magnitudes.slice(0, 50)
    });

    // Add to validated events
    setValidatedEvents(prev => [...prev.slice(-9), event]);

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

    // Auto-save if enabled (always use current saveLabel)
    // ONLY save verified footsteps, never noise
    if (autoSaveEnabled && !event.isNoise && !event.rejected) {
      await saveEventToBackend(event);
    }

    // Live predict if enabled and model trained
    if (livePredictEnabled && modelTrained) {
      await predictEvent(event);
    }
  };

  // ============== SAVE EVENT TO BACKEND ==============
  // Get the effective label: uses saveLabel (HOME/INTRUDER) with optional custom name
  const getEffectiveLabel = () => {
    const customName = labelName.trim();
    if (customName) {
      // Custom name provided - use it with the base label type
      return `${saveLabel}_${customName}`;
    }
    return saveLabel; // Just HOME or INTRUDER
  };

  const saveEventToBackend = async (event) => {
    // CRITICAL: Prevent saving noise events
    if (event.isNoise || event.rejected) {
      console.log('⛔ Blocked noise event from being saved');
      return;
    }

    // Throttle: max 2 saves per second
    const now = Date.now();
    if (now - lastSaveTimeRef.current < 500) return;
    lastSaveTimeRef.current = now;

    const backendData = FootstepEventDetector.toBackendFormat(event);
    if (!backendData) return;

    const effectiveLabel = getEffectiveLabel();

    try {
      const result = await api.saveTrainData(backendData, effectiveLabel);
      if (result.samples_per_person) {
        setSampleCounts(result.samples_per_person);
      }
      showToast(`💾 Auto-saved to ${effectiveLabel}`, 'success');
    } catch (error) {
      console.error("Auto-save failed:", error);
    }
  };

  // ============== PREDICT EVENT ==============
  const predictEvent = async (event) => {
    const backendData = FootstepEventDetector.toBackendFormat(event);
    if (!backendData) return;

    try {
      const result = await api.predict(backendData);

      // Apply custom threshold overrides
      let adjustedResult = { ...result };

      // Override anomaly threshold if custom is set
      if (mlThresholdOverride !== null) {
        const adjustedIsIntruder = result.anomaly_score > mlThresholdOverride;
        adjustedResult.is_intruder = adjustedIsIntruder;
        adjustedResult.prediction = adjustedIsIntruder ? 'INTRUDER' : 'HOME';
        adjustedResult.threshold = mlThresholdOverride;
      }

      // Apply confidence threshold for uncertain detection
      if (!adjustedResult.is_intruder && adjustedResult.confidence < confidenceThreshold) {
        adjustedResult.color_code = 'yellow';
        adjustedResult.confidence_band = 'low';
      }

      const formatted = formatPrediction(adjustedResult);
      setPrediction({ ...adjustedResult, formatted });

      if (adjustedResult.is_intruder) {
        alarmRef.current?.play();
        showToast(`🚨 INTRUDER: ${formatted.person} (${formatted.confidenceDisplay})`, 'error');
      } else if (adjustedResult.confidence < confidenceThreshold) {
        showToast(`⚠ Low confidence: ${formatted.person} (${formatted.confidenceDisplay})`, 'warning');
      } else {
        showToast(`✅ ${formatted.person}: ${formatted.confidenceDisplay}`, 'success');
      }
    } catch (error) {
      console.error("Prediction failed:", error);
    }
  };

  // ============== MANUAL SAVE ==============
  const handleSaveTrainData = async () => {
    if (validatedEvents.length === 0) {
      return showToast("⚠ No validated events to save.", "warning");
    }

    const effectiveLabel = getEffectiveLabel();
    setIsSaving(true);
    setStatus(`⬆ Uploading samples as "${effectiveLabel}"...`);

    try {
      let savedCount = 0;
      for (const event of validatedEvents) {
        const backendData = FootstepEventDetector.toBackendFormat(event);
        if (backendData) {
          await api.saveTrainData(backendData, effectiveLabel);
          savedCount++;
        }
      }

      await fetchStatus();
      setValidatedEvents([]);

      showToast(`✅ Saved ${savedCount} samples as "${effectiveLabel}"!`, 'success');
      setStatus(`✅ Saved ${savedCount} samples as "${effectiveLabel}"`);
    } catch (error) {
      showToast(`❌ Save failed: ${error.message}`, 'error');
      setStatus(`❌ Save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ============== TRAIN MODEL ==============
  const handleTrainModel = async () => {
    setIsTraining(true);
    setStatus("🧠 Training anomaly detector on HOME patterns...");

    try {
      const result = await api.trainModel(saveLabel);
      setModelTrained(true);

      if (result.metrics) {
        setTrainingMetrics(result.metrics);
        // Backend returns training_accuracy as a percentage (e.g., 95.5), not decimal
        const accuracy = result.metrics.training_accuracy ?? 0;
        showToast(`🎯 Anomaly detector trained! Accuracy: ${accuracy}%`, 'success');
        setStatus(`🎯 Anomaly detector ready! Accuracy: ${accuracy}%`);
      } else {
        showToast('🎯 Anomaly detector trained successfully!', 'success');
        setStatus("🎯 Anomaly detector trained on HOME patterns!");
      }

      await fetchStatus();
    } catch (error) {
      showToast(`❌ Training failed: ${error.message}`, 'error');
      setStatus(`❌ Training failed: ${error.message}`);
    } finally {
      setIsTraining(false);
    }
  };

  // ============== MANUAL PREDICT ==============
  const handlePredict = async () => {
    if (validatedEvents.length === 0) {
      return showToast("⚠ No footstep events to predict.", "warning");
    }

    setIsPredicting(true);
    setStatus("🔍 Predicting identity...");

    const lastEvent = validatedEvents[validatedEvents.length - 1];
    const backendData = FootstepEventDetector.toBackendFormat(lastEvent);

    if (!backendData) {
      showToast("⚠ Invalid event data", "warning");
      setIsPredicting(false);
      return;
    }

    try {
      const result = await api.predict(backendData);

      // Apply custom threshold overrides
      let adjustedResult = { ...result };

      if (mlThresholdOverride !== null) {
        const adjustedIsIntruder = result.anomaly_score > mlThresholdOverride;
        adjustedResult.is_intruder = adjustedIsIntruder;
        adjustedResult.prediction = adjustedIsIntruder ? 'INTRUDER' : 'HOME';
        adjustedResult.threshold = mlThresholdOverride;
      }

      if (!adjustedResult.is_intruder && adjustedResult.confidence < confidenceThreshold) {
        adjustedResult.color_code = 'yellow';
        adjustedResult.confidence_band = 'low';
      }

      const formatted = formatPrediction(adjustedResult);
      setPrediction({ ...adjustedResult, formatted });

      if (adjustedResult.is_intruder) {
        alarmRef.current?.play();
        showToast(`🚨 INTRUDER ALERT! Confidence: ${formatted.confidenceDisplay}`, 'error');
        setStatus(`🚨 INTRUDER DETECTED!`);
      } else if (adjustedResult.confidence < confidenceThreshold) {
        alarmRef.current?.play();
        showToast(`⚠ Low Confidence: ${formatted.person}`, 'warning');
        setStatus(`⚠ LOW CONFIDENCE: ${formatted.person} (${formatted.confidenceDisplay})`);
      } else {
        showToast(`✅ Family: ${formatted.person} (${formatted.confidenceDisplay})`, 'success');
        setStatus(`✅ IDENTIFIED: ${formatted.person} - ${formatted.confidenceDisplay}`);
      }
    } catch (error) {
      showToast('❌ Prediction failed!', 'error');
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
      setModelTrained(false);
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
      const response = await fetch('/dataset/download');
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

  // ============== CHART DATA ==============
  const amplifiedChartData = {
    labels: amplifiedData.map(d => d.time.toFixed(2)),
    datasets: [{
      label: "Amplified Signal",
      data: amplifiedData.map(d => d.value),
      borderColor: "#00eaff",
      backgroundColor: "rgba(0,234,255,0.15)",
      borderWidth: 1.5,
      pointRadius: 0,
      fill: true,
      tension: 0.1
    }]
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* LABEL SELECTOR - HOME or INTRUDER */}
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
          <label className="block text-sm text-gray-400 mb-2 font-semibold">💾 Save Samples As:</label>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setSaveLabel('HOME')}
              className={`flex-1 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${saveLabel === 'HOME'
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
            >
              <CheckCircle className="w-5" /> HOME
            </button>
            <button
              onClick={() => setSaveLabel('INTRUDER')}
              className={`flex-1 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${saveLabel === 'INTRUDER'
                ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg shadow-red-500/30'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
            >
              <AlertTriangle className="w-5" /> INTRUDER
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {saveLabel === 'HOME'
              ? '✅ Training data for HOME recognition'
              : '⚠️ Binary fallback training (optional)'}
          </p>
        </div>

        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
          <label className="block text-sm text-gray-400 mb-2">Person Name (Optional):</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
              placeholder="e.g., Pranshul, Aditi..."
              className="flex-1 text-white bg-gray-700 p-3 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
              onKeyPress={(e) => e.key === 'Enter' && showToast(`✅ Label: ${getEffectiveLabel()}`, 'success')}
            />
            <button
              onClick={() => showToast(`✅ Label: ${getEffectiveLabel()}`, 'success')}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-bold transition-all"
            >
              Set
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Saving as: <strong className={`text-base ${saveLabel === 'HOME' ? 'text-green-400' : 'text-red-400'}`}>{getEffectiveLabel()}</strong>
          </p>
        </div>

        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
          <label className="block text-sm text-gray-400 mb-2">Auto Modes:</label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSaveEnabled}
                onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                className="w-5 h-5 rounded bg-gray-700 border-gray-600"
              />
              <span className="text-sm">Auto-Save Events</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={livePredictEnabled}
                onChange={(e) => setLivePredictEnabled(e.target.checked)}
                className="w-5 h-5 rounded bg-gray-700 border-gray-600"
                disabled={!modelTrained}
              />
              <span className={`text-sm ${!modelTrained ? 'text-gray-500' : ''}`}>Live Predict</span>
            </label>
          </div>
        </div>
      </div>

      {/* SAMPLE COUNTS - ONE-CLASS ANOMALY DETECTION */}
      <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 text-cyan-400" />
            <span className="font-semibold">Training Data (One-Class Anomaly Detection)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs ${modelTrained ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              {modelTrained ? '✓ Model Ready' : '⚠ Not Trained'}
            </span>
            <button onClick={fetchStatus} className="p-2 hover:bg-gray-700 rounded-lg transition">
              <RefreshCw className="w-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {/* HOME Counter - Main training data */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 shadow-lg shadow-green-500/20">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-5 text-white" />
              <span className="text-sm text-gray-200">HOME (Training Data)</span>
            </div>
            <div className="text-3xl font-bold">{sampleCounts.HOME || 0}</div>
            <div className="text-xs text-gray-200">samples</div>
          </div>

          {/* Anomaly Detection Info */}
          <div className="p-4 rounded-xl bg-gray-700/50 border border-dashed border-gray-500">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 text-yellow-400" />
              <span className="text-sm text-gray-300">INTRUDER Detection</span>
            </div>
            <div className="text-lg font-semibold text-yellow-400">Auto-Detected</div>
            <div className="text-xs text-gray-400">via anomaly scoring</div>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">HOME samples: {sampleCounts.HOME || 0}</span>
            <span className={`${(sampleCounts.HOME || 0) >= 10 ? 'text-green-400' : 'text-yellow-400'}`}>
              {(sampleCounts.HOME || 0) >= 10
                ? '✅ Ready to train anomaly detector!'
                : `⚠ Need ≥10 HOME samples`}
            </span>
          </div>
        </div>
      </div>      {/* CONTROL BUTTONS */}
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

        <button
          onClick={handleSaveTrainData}
          disabled={isSaving || validatedEvents.length === 0}
          className="bg-gradient-to-r from-green-500 to-emerald-500 px-5 py-3 rounded-xl flex gap-2 items-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg shadow-green-500/20"
        >
          {isSaving ? <RefreshCw className="animate-spin w-5" /> : <Database className="w-5" />}
          Save ({validatedEvents.length})
        </button>

        <button
          onClick={handleTrainModel}
          disabled={isTraining}
          className="bg-gradient-to-r from-yellow-500 to-orange-500 px-5 py-3 rounded-xl flex gap-2 items-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-yellow-600 hover:to-orange-600 transition-all shadow-lg shadow-yellow-500/20"
        >
          {isTraining ? <RefreshCw className="animate-spin w-5" /> : <BrainCircuit className="w-5" />}
          Train Model
        </button>

        <button
          onClick={handlePredict}
          disabled={isPredicting || validatedEvents.length === 0 || !modelTrained}
          className="bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-3 rounded-xl flex gap-2 items-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/20"
        >
          {isPredicting ? <RefreshCw className="animate-spin w-5" /> : <Play className="w-5" />}
          Predict
        </button>
      </div>

      {/* STATUS BAR */}
      <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="w-5 text-cyan-400" />
            <span className="font-medium">{status}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>Samples: {detectionStats.totalSamples}</span>
            <span className="text-green-400">Events: {detectionStats.eventsDetected}</span>
            <span className="text-red-400">Noise: {detectionStats.noiseRejected}</span>
            {currentEventInfo && (
              <span className="text-yellow-400 animate-pulse">
                Recording: {currentEventInfo.length} samples
              </span>
            )}
          </div>
        </div>
      </div>

      {/* PREDICTION RESULT */}
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
            {prediction.alert && <span className="text-sm opacity-75">{prediction.alert}</span>}
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
            <Line data={amplifiedChartData} options={chartOptions} />
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
                      {datasetInfo.persons?.map((person) => (
                        <tr key={person.name} className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-sm ${person.name === 'HOME' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                              }`}>
                              {person.name === 'HOME' ? '🏠' : '🚨'} {person.name}
                            </span>
                          </td>
                          <td className="p-3 text-gray-400">{person.type || person.name}</td>
                          <td className="p-3 font-bold">{person.samples}</td>
                          <td className="p-3">
                            <button
                              onClick={() => handleDeletePerson(person.name)}
                              disabled={isDeleting || person.samples === 0}
                              className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded-full text-sm flex items-center gap-1 disabled:opacity-50 transition"
                            >
                              <Trash2 className="w-4" /> Delete
                            </button>
                          </td>
                        </tr>
                      ))}
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
