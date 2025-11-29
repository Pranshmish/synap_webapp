import { useState, useEffect, useRef, useCallback } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
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
} from "lucide-react";

// Import API and utilities
import { api, PERSONS, BUFFER_CONFIG } from "../config/api";
import {
  splitIntoChunks,
  getLastChunk,
  formatSampleCounts,
  formatPrediction,
  formatMetrics,
  isConfidentMatch,
} from "../utils/formatData";

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Filler
);

function Vibrations() {
  // Person selection (user input for family member name)
  const [personName, setPersonName] = useState("");

  // Live data for graph display
  const [liveData, setLiveData] = useState([]);

  // Buffer for collecting samples
  const [recordBuffer, setRecordBuffer] = useState([]);

  // Status message
  const [status, setStatus] = useState("Idle...");

  // Prediction result from backend
  const [prediction, setPrediction] = useState(null);

  // Serial connection state
  const [isConnected, setIsConnected] = useState(false);

  // Sample counts per person from backend
  const [sampleCounts, setSampleCounts] = useState({});

  // Model training status
  const [modelTrained, setModelTrained] = useState(false);

  // Training metrics
  const [trainingMetrics, setTrainingMetrics] = useState(null);

  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dataset manager state
  const [datasetInfo, setDatasetInfo] = useState(null);
  const [showDatasetManager, setShowDatasetManager] = useState(false);

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  // Refs
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const stopRef = useRef(false);
  const alarmRef = useRef(null);
  const bufferTimeoutRef = useRef(null);

  // ------------------------ TOAST NOTIFICATION SYSTEM ------------------------
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    // Auto remove after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // ------------------------ SERIAL SUPPORT CHECK ------------------------
  useEffect(() => {
    if (!("serial" in navigator)) {
      alert("⚠ Web Serial API NOT supported. Use Chrome/Edge desktop.");
    }
  }, []);

  // ------------------------ FETCH STATUS ON MOUNT ------------------------
  useEffect(() => {
    fetchStatus();
    // Refresh status every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // ------------------------ CLEANUP ON EXIT ------------------------
  useEffect(() => {
    return () => {
      stopRef.current = true;
      readerRef.current?.cancel().catch(() => { });
      portRef.current?.close().catch(() => { });
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current);
      }
    };
  }, []);

  // ------------------------ FETCH BACKEND STATUS ------------------------
  const fetchStatus = async () => {
    try {
      const result = await api.getStatus();
      setSampleCounts(result.samples || {});
      setModelTrained(result.model_trained || false);
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  };

  // ------------------------ CONNECT SERIAL ------------------------
  const connectSerial = async () => {
    if (!personName.trim()) return setStatus("⚠ Enter a family member name first.");

    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: BUFFER_CONFIG.BAUD_RATE });

      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();

      portRef.current = port;
      readerRef.current = reader;
      stopRef.current = false;

      setIsConnected(true);
      setLiveData([]);
      setRecordBuffer([]);
      setStatus("🟢 Connected. Receiving live data...");

      readLoop(reader);
    } catch {
      setStatus("❌ Failed to connect to port.");
    }
  };

  // ------------------------ SERIAL READ LOOP ------------------------
  const readLoop = async (reader) => {
    // Reset buffer timeout on data receive
    const resetBufferTimeout = () => {
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current);
      }
      bufferTimeoutRef.current = setTimeout(() => {
        setRecordBuffer([]);
        setStatus("⚠ Buffer cleared (timeout - no data for 2s)");
      }, BUFFER_CONFIG.BUFFER_TIMEOUT_MS);
    };

    while (!stopRef.current) {
      const { value, done } = await reader.read();
      if (done || !value) break;

      resetBufferTimeout();

      value.split("\n").forEach((line) => {
        const amp = parseFloat(line.trim());
        // Validate ADC value (0-4095 range)
        if (isNaN(amp) || amp < BUFFER_CONFIG.MIN_ADC_VALUE || amp > BUFFER_CONFIG.MAX_ADC_VALUE) return;

        const t = performance.now() / 1000;

        setLiveData((prev) => [...prev.slice(-300), { time: t, amplitude: amp }]);
        setRecordBuffer((prev) => [...prev, { time: t, amplitude: amp }]);
      });
    }
  };

  // ------------------------ DISCONNECT SERIAL ------------------------
  const disconnectSerial = async () => {
    stopRef.current = true;
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
    }
    await readerRef.current?.cancel().catch(() => { });
    await portRef.current?.close().catch(() => { });
    setIsConnected(false);
    setStatus("🔌 Disconnected.");
  };

  // ------------------------ 1️⃣ SAVE TRAINING DATA (BACKEND FORMAT) ------------------------
  const handleSaveTrainData = async () => {
    if (!personName.trim()) return setStatus("⚠ Enter a family member name first.");
    if (recordBuffer.length < BUFFER_CONFIG.CHUNK_SIZE)
      return setStatus(`⚠ Need at least ${BUFFER_CONFIG.CHUNK_SIZE} samples before saving.`);

    // Split buffer into 200-sample chunks
    const chunks = splitIntoChunks(recordBuffer);

    if (chunks.length === 0) {
      return setStatus("⚠ Not enough complete chunks to save.");
    }

    setIsSaving(true);
    setStatus("⬆ Uploading training data...");

    try {
      // Use the API helper with correct backend format
      const result = await api.saveMultipleChunks(chunks, personName);

      // Update sample counts from response
      if (result.samples_per_person) {
        setSampleCounts(result.samples_per_person);
      }

      // Clear buffer after successful save
      setRecordBuffer([]);

      setStatus(`✅ Saved ${chunks.length} chunk(s) for ${personName}. Counts: ${formatSampleCounts(result.samples_per_person)}`);
    } catch (error) {
      setStatus(`❌ Save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ------------------------ 2️⃣ TRAIN MODEL (BACKEND FORMAT) ------------------------
  const handleTrainModel = async () => {
    setIsTraining(true);
    setStatus("🤖 Training model...");

    try {
      // Use API helper with train_model: true
      const result = await api.trainModel(personName);

      // Update training status
      setModelTrained(true);

      // Store and display metrics if available
      if (result.metrics) {
        setTrainingMetrics(result.metrics);
        const metricsDisplay = formatMetrics(result.metrics);
        setStatus(`🎯 Model trained! ${metricsDisplay}`);
      } else {
        setStatus("🎯 Model trained successfully!");
      }

      // Refresh status to get updated counts
      await fetchStatus();
    } catch (error) {
      setStatus(`❌ Training failed: ${error.message}`);
    } finally {
      setIsTraining(false);
    }
  };

  // ------------------------ 3️⃣ PREDICT (BACKEND FORMAT) ------------------------
  const handlePredict = async () => {
    if (recordBuffer.length < BUFFER_CONFIG.CHUNK_SIZE)
      return setStatus(`⚠ Need at least ${BUFFER_CONFIG.CHUNK_SIZE} samples to predict.`);

    // Get last 200 samples for prediction
    const lastChunk = getLastChunk(recordBuffer);

    if (!lastChunk) {
      return setStatus("⚠ Invalid data for prediction.");
    }

    setIsPredicting(true);
    setStatus("🔍 Predicting identity...");

    try {
      // Use API helper - data is sent DIRECTLY as array (no raw_time_series wrapper)
      const result = await api.predict(lastChunk);

      // Format prediction for display
      const formatted = formatPrediction(result);
      setPrediction({
        ...result,
        formatted,
      });

      // Check if confident match
      const isMatch = isConfidentMatch(result, 0.5);

      if (!isMatch) {
        // Play alarm for low confidence / unknown person
        if (alarmRef.current) {
          alarmRef.current.currentTime = 0;
          alarmRef.current.play();
        }
        setStatus(`🚨 LOW CONFIDENCE: ${formatted.person} (${formatted.confidenceDisplay})`);
      } else {
        setStatus(`✅ IDENTIFIED: ${formatted.person} - Confidence: ${formatted.confidenceDisplay}`);
      }
    } catch (error) {
      setStatus(`❌ Prediction failed: ${error.message}`);
      setPrediction(null);
    } finally {
      setIsPredicting(false);
    }
  };

  // ------------------------ 4️⃣ RESET MODEL & DATASET ------------------------
  const handleResetModel = async () => {
    if (!window.confirm('🚨 DELETE ALL data and models? This cannot be undone!')) {
      return;
    }

    setIsResetting(true);
    setStatus("🔄 Resetting model and data...");

    try {
      const result = await api.resetModel();

      // Clear local state
      setSampleCounts({});
      setModelTrained(false);
      setTrainingMetrics(null);
      setPrediction(null);
      setDatasetInfo(null);

      // Format reset time for display
      const resetTime = result.reset_time ? result.reset_time.slice(11, 19) : 'now';
      const deletedSamples = result.deleted?.samples || 0;

      setStatus(`✅ Reset complete at ${resetTime} (${deletedSamples} samples deleted)`);
      showToast(`🚀 Reset complete! ${deletedSamples} samples deleted. Ready for new data.`, 'success');

      // Refresh status
      await fetchStatus();
    } catch (error) {
      setStatus(`❌ Reset failed: ${error.message}`);
      showToast('❌ Reset failed!', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  // ------------------------ 5️⃣ LOAD DATASET INFO ------------------------
  const loadDatasetInfo = async () => {
    try {
      const result = await api.getDataset();
      setDatasetInfo(result);
    } catch (error) {
      console.error("Failed to load dataset:", error);
      setDatasetInfo(null);
      showToast('❌ Failed to load dataset info', 'error');
    }
  };

  // ------------------------ 6️⃣ DELETE PERSON DATA ------------------------
  const handleDeletePerson = async (personName) => {
    if (!window.confirm(`🗑️ Delete all data for ${personName}? This cannot be undone!`)) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await api.deletePerson(personName);
      showToast(result.message || `✅ Deleted data for ${personName}`, 'success');

      // Refresh dataset info and status
      await loadDatasetInfo();
      await fetchStatus();
    } catch (error) {
      showToast(`❌ Failed to delete ${personName}: ${error.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Load dataset info when manager is opened
  useEffect(() => {
    if (showDatasetManager) {
      loadDatasetInfo();
    }
  }, [showDatasetManager]);

  // ------------------------ GRAPH SETUP ------------------------
  const liveChartData = {
    labels: liveData.map((d) => d.time.toFixed(1)),
    datasets: [
      {
        label: "Vibration Waveform",
        data: liveData.map((d) => d.amplitude),
        borderColor: "#00eaff",
        backgroundColor: "rgba(0,234,255,0.2)",
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold flex gap-2 items-center mb-6">
        <Activity /> Vibration Identity Recognition System
      </h1>

      {/* PERSON SELECTOR (Dropdown) */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Enter Family Member Name for Training:</label>
        <input
          type="text"
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          placeholder="Enter family member name..."
          className="text-black p-3 rounded-lg w-64 bg-white"
        />
      </div>

      {/* SAMPLE COUNTS PER PERSON */}
      <div className="mb-6 p-4 bg-gray-800 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5" />
          <span className="font-semibold">Training Data Counts:</span>
          <button
            onClick={fetchStatus}
            className="ml-auto text-sm bg-gray-700 px-3 py-1 rounded-lg hover:bg-gray-600 flex items-center gap-1"
          >
            <RefreshCw className="w-4" /> Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.keys(sampleCounts).length > 0 ? (
            Object.entries(sampleCounts).map(([person, count]) => (
              <div
                key={person}
                className={`p-3 rounded-lg ${personName.toLowerCase() === person.toLowerCase() ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
              >
                <div className="text-sm text-gray-300">{person}</div>
                <div className="text-2xl font-bold">{count || 0}</div>
                <div className="text-xs text-gray-400">samples</div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-gray-500 text-center py-4">
              No training data yet. Enter a family member name and start collecting samples.
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className={modelTrained ? 'text-green-400' : 'text-yellow-400'}>
            {modelTrained ? (
              <><CheckCircle className="w-4 inline" /> Model Trained</>
            ) : (
              <><AlertTriangle className="w-4 inline" /> Model Not Trained</>
            )}
          </span>
        </div>
      </div>

      {/* RESET & DATASET MANAGER SECTION */}
      <div className="mb-6 p-4 bg-gray-800 rounded-xl border border-red-900/30">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {/* Reset Button */}
          <button
            onClick={handleResetModel}
            disabled={isResetting}
            className="bg-gradient-to-r from-red-500 to-red-700 text-white px-6 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ boxShadow: '0 4px 15px rgba(255, 68, 68, 0.4)' }}
          >
            {isResetting ? <RefreshCw className="animate-spin w-5" /> : <RotateCcw className="w-5" />}
            🚀 Reset Model & Dataset
          </button>

          {/* Dataset Manager Toggle */}
          <button
            onClick={() => setShowDatasetManager(!showDatasetManager)}
            className="bg-gray-700 text-white px-5 py-3 rounded-xl flex gap-2 items-center hover:bg-gray-600 transition"
          >
            <Table className="w-5" />
            📊 {showDatasetManager ? 'Hide' : 'Show'} Dataset Manager
          </button>
        </div>

        {/* Dataset Manager Panel */}
        {showDatasetManager && (
          <div className="bg-gray-900 p-4 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Database className="w-5" /> Dataset Manager
              </h3>
              <button
                onClick={loadDatasetInfo}
                className="text-sm bg-gray-700 px-3 py-1 rounded-lg hover:bg-gray-600 flex items-center gap-1"
              >
                <RefreshCw className="w-4" /> Refresh
              </button>
            </div>

            {datasetInfo ? (
              <>
                {/* Dataset Table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left p-3 text-gray-400">Person</th>
                        <th className="text-left p-3 text-gray-400">Samples</th>
                        <th className="text-left p-3 text-gray-400">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datasetInfo.persons && datasetInfo.persons.map((person) => (
                        <tr key={person.name} className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="p-3 font-semibold">{person.name}</td>
                          <td className="p-3">{person.samples}</td>
                          <td className="p-3">
                            <button
                              onClick={() => handleDeletePerson(person.name)}
                              disabled={isDeleting || person.samples === 0}
                              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              <Trash2 className="w-4" /> Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Dataset Summary */}
                <div className="mt-4 text-sm text-gray-400 flex flex-wrap gap-4">
                  <span>📊 Total: <strong className="text-white">{datasetInfo.total_samples || 0}</strong> samples</span>
                  <span>🤖 Model: <strong className={datasetInfo.model_status === 'trained' ? 'text-green-400' : 'text-yellow-400'}>
                    {datasetInfo.model_status || 'not trained'}
                  </strong></span>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500 py-4">
                Loading dataset info...
              </div>
            )}
          </div>
        )}
      </div>

      {/* BUTTONS */}
      <div className="flex flex-wrap gap-4 mb-6">
        <button
          onClick={isConnected ? disconnectSerial : connectSerial}
          className={`${isConnected ? 'bg-red-600' : 'bg-blue-600'} text-white px-5 py-3 rounded-xl flex gap-2 items-center hover:opacity-90 transition`}
        >
          <PlugZap />
          {isConnected ? "Disconnect" : "Connect Serial"}
        </button>

        <button
          onClick={handleSaveTrainData}
          disabled={isSaving || !isConnected}
          className="bg-green-600 text-white px-5 py-3 rounded-xl flex gap-2 items-center hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? <RefreshCw className="animate-spin" /> : <Database />}
          Save Train Data
        </button>

        <button
          onClick={handleTrainModel}
          disabled={isTraining}
          className="bg-yellow-600 text-white px-5 py-3 rounded-xl flex gap-2 items-center hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTraining ? <RefreshCw className="animate-spin" /> : <BrainCircuit />}
          Train Model
        </button>

        <button
          onClick={handlePredict}
          disabled={isPredicting || !isConnected}
          className="bg-purple-600 text-white px-5 py-3 rounded-xl flex gap-2 items-center hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPredicting ? <RefreshCw className="animate-spin" /> : <Play />}
          Predict
        </button>
      </div>

      {/* BUFFER INFO */}
      <div className="mb-4 text-sm text-gray-400">
        Buffer: {recordBuffer.length} samples | Chunks ready: {Math.floor(recordBuffer.length / BUFFER_CONFIG.CHUNK_SIZE)}
      </div>

      {/* STATUS */}
      <p className="text-lg flex gap-2 items-center mb-4">
        <Cpu className="w-5" /> {status}
      </p>

      {/* PREDICTION RESULT CARD */}
      {prediction && prediction.formatted && (
        <div className={`mb-6 p-4 rounded-xl ${isConfidentMatch(prediction, 0.5) ? 'bg-green-800' : 'bg-red-800'
          }`}>
          <div className="text-xl font-bold mb-2">
            {isConfidentMatch(prediction, 0.5) ? '✅ IDENTIFIED' : '🚨 LOW CONFIDENCE'}
          </div>
          <div className="text-3xl font-bold mb-2">{prediction.formatted.person}</div>
          <div className="text-xl mb-3">Confidence: {prediction.formatted.confidenceDisplay}</div>

          {/* Probability Bars */}
          {prediction.probabilities && (
            <div className="space-y-2">
              <div className="text-sm text-gray-300 mb-2">All Probabilities:</div>
              {Object.entries(prediction.probabilities)
                .sort((a, b) => b[1] - a[1])
                .map(([name, prob]) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="w-20 text-sm">{name}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${prob * 100}%` }}
                      />
                    </div>
                    <span className="text-sm w-16 text-right">{(prob * 100).toFixed(1)}%</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TRAINING METRICS */}
      {trainingMetrics && (
        <div className="mb-6 p-4 bg-green-900 rounded-xl">
          <div className="font-bold mb-2">📊 Training Metrics:</div>
          <div className="text-sm">{formatMetrics(trainingMetrics)}</div>
        </div>
      )}

      {/* LIVE GRAPH */}
      <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
        <Line data={liveChartData} height={120} />
      </div>

      <audio ref={alarmRef} src="/alarm.mp3" preload="auto" />

      {/* TOAST NOTIFICATIONS */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slide-in cursor-pointer transition-all hover:scale-105 ${toast.type === 'error'
              ? 'bg-red-600 text-white'
              : toast.type === 'warning'
                ? 'bg-yellow-600 text-white'
                : 'bg-green-600 text-white'
              }`}
            onClick={() => removeToast(toast.id)}
          >
            <span>{toast.message}</span>
            <button className="ml-2 text-white/70 hover:text-white">✕</button>
          </div>
        ))}
      </div>

      {/* Toast animation styles */}
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

export default Vibrations;
