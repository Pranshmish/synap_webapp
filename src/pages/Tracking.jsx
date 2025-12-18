import React, { useState, useEffect, useRef } from 'react';
import { PlugZap, Target, AlertTriangle, Sliders, Activity, RotateCcw, Database, Cpu, Zap, Search } from "lucide-react";
import FootstepMap from "../components/FootstepMap";
import { PositionTracker } from "../utils/positionTracking";
import { api, BUFFER_CONFIG } from "../config/api";
import { FootstepEventDetector, DETECTION_CONFIG } from "../utils/signalProcessing";
import { useEsp32WebSocket } from "../hooks/useEsp32WebSocket";

const Tracking = () => {
    // State
    const [isConnected, setIsConnected] = useState(false);
    const [currentPosition, setCurrentPosition] = useState(null);
    const [positionHistory, setPositionHistory] = useState([]);
    const [status, setStatus] = useState("WiFi Gateway Ready");
    const [connectionMethod, setConnectionMethod] = useState('websocket');
    const [gatewayIp, setGatewayIp] = useState("192.168.4.1");
    const [lastRawData, setLastRawData] = useState("No data received yet");
    const [latestAmplitudes, setLatestAmplitudes] = useState([0, 0, 0, 0]);
    const [liveRawValues, setLiveRawValues] = useState([2048, 2048, 2048, 2048]);
    const liveRawValuesRef = useRef([2048, 2048, 2048, 2048]);

    const [vibrationGains, setVibrationGains] = useState([
        DETECTION_CONFIG.GAIN || 50,
        DETECTION_CONFIG.GAIN || 50,
        DETECTION_CONFIG.GAIN || 50,
        DETECTION_CONFIG.GAIN || 50
    ]);
    const [adcGates, setAdcGates] = useState([75, 75, 75, 75]);
    const [activeChannels, setActiveChannels] = useState([true, true, true, true]);
    const activeChannelsRef = useRef([true, true, true, true]);

    const [sensitivity, setSensitivity] = useState(75);
    const [focus, setFocus] = useState(3);
    const [isAutoTest, setIsAutoTest] = useState(false);
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [diagnosisReport, setDiagnosisReport] = useState(null);
    const isDiagnosingRef = useRef(false); // Ref to avoid stale closure in readLoop

    // Calibration State
    const [isCalibrationMode, setIsCalibrationMode] = useState(false);
    const [calibrationPoints, setCalibrationPoints] = useState([
        { x: 45.2, y: 63.5, amplitudes: [29, 0, 0, 0], timestamp: 1734500000001 },
        { x: 45.8, y: 63.3, amplitudes: [114, 0, 1, 0], timestamp: 1734500000002 },
        { x: 1.2, y: 63.8, amplitudes: [463, 6, 1, 3], timestamp: 1734500000003 },
        { x: 0.8, y: 0.9, amplitudes: [0, 0, 7, 0], timestamp: 1734500000004 },
        { x: 0.8, y: 1.0, amplitudes: [1, 0, 1, 9], timestamp: 1734500000005 },
        { x: 46.3, y: 1.0, amplitudes: [0, 0, 0, 12], timestamp: 1734500000006 },
        { x: 45.3, y: 2.1, amplitudes: [0, 9, 1, 5], timestamp: 1734500000007 },
        { x: 45.9, y: 1.4, amplitudes: [0, 0, 5, 0], timestamp: 1734500000008 },
        { x: 23.4, y: 33.1, amplitudes: [29, 17, 0, 44], timestamp: 1734500000009 },
        { x: 23.7, y: 33.4, amplitudes: [7, 24, 4, 48], timestamp: 1734500000010 }
    ]);
    const [selectedTarget, setSelectedTarget] = useState(null); // {x, y} targets for next tap
    const [lastCalibrationAmps, setLastCalibrationAmps] = useState([0, 0, 0, 0]);
    const lastValidAmpsRef = useRef([0, 0, 0, 0]); // Store last trigger's amps for calibration
    const isCalibrationModeRef = useRef(false);

    // TDOA Window Buffering
    const isCapturingWindowRef = useRef(false);
    const windowBufferRef = useRef([[], [], [], []]);
    const WINDOW_SIZE = 250; // 250ms at 1kHz
    const windowCounterRef = useRef(0);

    // Refs
    const portRef = useRef(null);
    const readerRef = useRef(null);
    const readableStreamClosedRef = useRef(null);
    const wsRef = useRef(null);
    const positionTrackerRef = useRef(null);
    const recentAmplitudesRef = useRef([]); // Buffer for amplitude data
    const lastUpdateRef = useRef(0); // For throttling UI updates
    const diagnosticBufferRef = useRef([]);
    const detectorsRef = useRef([null, null, null, null]);

    // Initialize ESP32 WebSocket Hook
    const {
        status: wsStatus,
        isConnected: isWsConnected,
        toggleConnection: toggleWsConnection,
        disconnect: disconnectWS
    } = useEsp32WebSocket(gatewayIp, 81, (data) => {
        // Forward to the universal processing logic
        // We construct the string format processSerialLine expects for consistency,
        // or we could refactor processSerialLine to take an object.
        // For minimal breakage, we'll feed it the raw format.
        const line = `CH1:${data.ch1} CH2:${data.ch2} CH3:${data.ch3} CH4:${data.ch4}`;
        processSerialLine(line);
    });

    // Sync status from hook
    useEffect(() => {
        if (connectionMethod === 'websocket') {
            setStatus(wsStatus);
        }
    }, [wsStatus, connectionMethod]);

    const effectiveIsConnected = (connectionMethod === 'serial' ? isConnected : isWsConnected);


    // Initialize Tracker & Detectors
    useEffect(() => {
        // Initialize tracker for 47x65cm surface
        positionTrackerRef.current = new PositionTracker(47, 65);

        if (positionTrackerRef.current && positionTrackerRef.current.setThreshold) {
            positionTrackerRef.current.setThreshold(adcGates);
        }

        // Initialize 4 detectors (one for each channel)
        for (let i = 0; i < 4; i++) {
            detectorsRef.current[i] = new FootstepEventDetector(DETECTION_CONFIG);
        }

        return () => {
            if (isConnected) {
                disconnectSerial();
                disconnectWebSocket();
            }
        };
    }, []);

    // Sync tuning to detectors
    useEffect(() => {
        for (let i = 0; i < 4; i++) {
            if (detectorsRef.current[i]) {
                detectorsRef.current[i].updateConfig({
                    GAIN: vibrationGains[i],
                    RAW_DELTA_GATE_ADC: adcGates[i],
                    ADAPTIVE_THRESHOLD_MULT: sensitivity / 10 // Map sensitivity slider to mult
                });
            }
        }
        if (positionTrackerRef.current) {
            if (positionTrackerRef.current.setThreshold) positionTrackerRef.current.setThreshold(adcGates);
            if (positionTrackerRef.current.setSharpening) positionTrackerRef.current.setSharpening(focus);
            if (positionTrackerRef.current.setCalibrationData) positionTrackerRef.current.setCalibrationData(calibrationPoints);
        }
    }, [vibrationGains, adcGates, sensitivity, focus, calibrationPoints]);

    const resetAllDetectors = () => {
        for (let i = 0; i < 4; i++) {
            detectorsRef.current[i]?.reset();
        }
        setStatus("🔄 Detectors Recalibrated");
    };

    const handleChannelGainChange = (idx, val) => {
        const gain = parseInt(val);
        setVibrationGains(prev => {
            const next = [...prev];
            next[idx] = gain;
            return next;
        });
    };

    const handleChannelGateChange = (idx, val) => {
        const gate = parseInt(val);
        setAdcGates(prev => {
            const next = [...prev];
            next[idx] = gate;
            return next;
        });
    };

    // Auto Test Loop
    useEffect(() => {
        let interval;
        if (isAutoTest && positionTrackerRef.current) {
            let step = 0;
            interval = setInterval(() => {
                const res = positionTrackerRef.current.simulateStep(step);
                if (res) {
                    setCurrentPosition({ ...res, timestamp: Date.now() });
                    setPositionHistory(p => [...p, { ...res, timestamp: Date.now() }].slice(-20));
                }
                step = (step + 1) % 4;
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isAutoTest]);

    // ============== POSITION CALCULATION ==============
    const calculateFootstepPosition = (windowData) => {
        if (!positionTrackerRef.current) return;

        // Use the new window-based TDOA algorithm
        const result = positionTrackerRef.current.calculatePosition(windowData);

        if (result && result.confidence > 0.5) {
            const newPos = { ...result, timestamp: Date.now() };
            setCurrentPosition(newPos);
            setPositionHistory(prev => [...prev, newPos].slice(-20));
        }
    };

    // ============== SERIAL CONNECTION ==============
    const connectSerial = async () => {
        try {
            if (!navigator.serial) {
                alert("Web Serial API not supported! Use Chrome or Edge.");
                return;
            }

            setStatus("Requesting port...");
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: BUFFER_CONFIG.BAUD_RATE });
            portRef.current = port;

            setStatus("Connected! listening...");
            setIsConnected(true);

            // Start reading
            const textDecoder = new TextDecoderStream();
            readableStreamClosedRef.current = port.readable.pipeTo(textDecoder.writable);
            const reader = textDecoder.readable.getReader();
            readerRef.current = reader;

            readLoop(reader);

        } catch (err) {
            console.error("Connection error:", err);
            setStatus(`Connection failed: ${err.message}`);
            setIsConnected(false);
        }
    };

    const disconnectSerial = async () => {
        try {
            if (readerRef.current) {
                await readerRef.current.cancel();
                readerRef.current = null;
            }
            if (readableStreamClosedRef.current) {
                await readableStreamClosedRef.current.catch(() => { });
                readableStreamClosedRef.current = null;
            }
            if (portRef.current) {
                await portRef.current.close();
                portRef.current = null;
            }
            setIsConnected(false);
            setStatus("Disconnected");
        } catch (err) {
            console.error("Disconnect error:", err);
        }
    };

    // ============== WEBSOCKET CONNECTION ==============
    const connectWebSocket = () => {
        toggleWsConnection();
    };

    const disconnectWebSocket = () => {
        disconnectWS();
    };

    const readLoop = async (reader) => {
        let buffer = "";

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += value;
                const lines = buffer.split("\n");
                buffer = lines.pop(); // Keep incomplete line

                for (const line of lines) {
                    processSerialLine(line.trim());
                }
            }
        } catch (error) {
            console.error("Read error:", error);
        } finally {
            reader.releaseLock();
        }
    };

    const processSerialLine = (line) => {
        if (!line) return;

        // Throttle UI updates for raw data (every ~100ms)
        const now = Date.now();
        const shouldUpdateUI = now - lastUpdateRef.current > 100;

        if (shouldUpdateUI) {
            setLastRawData(line.substring(0, 100)); // Show beginning of line
            lastUpdateRef.current = now;
        }

        let values = {};
        let isValid = false;

        // 1. Try parsing "CH1:1234 CH2:..." format
        if (line.includes("CH")) {
            const parts = line.split(" ");
            parts.forEach(p => {
                const [k, v] = p.split(":");
                if (k && v) {
                    const chIndex = parseInt(k.replace("CH", "")) - 1;
                    if (!isNaN(chIndex)) {
                        values[chIndex] = parseInt(v);
                        isValid = true;
                    }
                }
            });
        }
        // 2. Try parsing CSV "100,200,300,400" format
        else if (line.includes(",")) {
            const parts = line.split(",");
            if (parts.length >= 4) {
                parts.forEach((v, i) => { values[i] = parseInt(v); });
                isValid = true;
            }
        }

        if (isValid && Object.keys(values).length >= 4) {
            const now = performance.now() / 1000;
            const rawAmplitudes = [values[0] || 0, values[1] || 0, values[2] || 0, values[3] || 0];

            // Update UI Monitor
            if (shouldUpdateUI) {
                setLatestAmplitudes(rawAmplitudes);
            }

            // PROCESS THROUGH DETECTORS (Like in Vibrations section)
            // This applies bandpass filtering and adaptive noise floor tracking
            const processedAmps = [0, 0, 0, 0];
            let triggerEnergy = 0;
            let triggerThreshold = 0;

            for (let i = 0; i < 4; i++) {
                if (detectorsRef.current[i]) {
                    // Check if channel is active
                    const sample = activeChannelsRef.current[i] ? rawAmplitudes[i] : 2048;
                    const result = detectorsRef.current[i].processSample(sample);

                    // Update live values for monitor
                    liveRawValuesRef.current[i] = sample;

                    // Use un-amplified filtered signal for tracking to avoid bias
                    processedAmps[i] = Math.abs(result.filtered) / (detectorsRef.current[i].config.GAIN || 1);

                    // Track max energy for triggering
                    if (result.energy > triggerEnergy) {
                        triggerEnergy = result.energy;
                        triggerThreshold = result.threshold;
                    }
                }
            }

            // DIAGNOSTICS CAPTURE (Check Ref, not State)
            if (isDiagnosingRef.current) {
                diagnosticBufferRef.current.push(processedAmplitudes);
            }

            if (shouldUpdateUI) {
                setLiveRawValues([...liveRawValuesRef.current]);
            }

            recentAmplitudesRef.current.push(processedAmps);
            if (recentAmplitudesRef.current.length > 20) recentAmplitudesRef.current.shift();

            // TDOA WINDOW CAPTURE LOGIC
            if (isCapturingWindowRef.current) {
                for (let i = 0; i < 4; i++) {
                    windowBufferRef.current[i].push(rawAmplitudes[i]);
                }
                windowCounterRef.current++;

                if (windowCounterRef.current >= WINDOW_SIZE) {
                    isCapturingWindowRef.current = false;
                    calculateFootstepPosition(windowBufferRef.current);
                    setStatus("📍 Position localized");
                }
                return; // Suppress other triggers during capture
            }

            // TRIGGER: Lowered to 1.15x for weaker surface signals
            if (triggerEnergy > triggerThreshold * 1.15) {
                lastValidAmpsRef.current = [...processedAmps];
                setLastCalibrationAmps([...processedAmps]);

                // START WINDOW CAPTURE
                isCapturingWindowRef.current = true;
                windowCounterRef.current = 0;
                windowBufferRef.current = [[], [], [], []];
                setStatus("📡 Localizing impact...");
            }
        }
    };

    // CALIBRATION HANDLERS
    const handleMapClick = (coords) => {
        if (!isCalibrationMode) return;
        setSelectedTarget(coords);
        setStatus(`🎯 Ready for tap at [${coords.x}, ${coords.y}]`);
    };

    const addCalibrationPoint = () => {
        if (!selectedTarget) {
            alert("Click on the map first to select target location!");
            return;
        }

        // Ensure we have some data
        if (lastCalibrationAmps.every(a => a === 0)) {
            if (!window.confirm("No vibration data detected yet. Save anyway with zero values?")) return;
        }

        const newPoint = {
            ...selectedTarget,
            amplitudes: [...lastCalibrationAmps],
            timestamp: Date.now()
        };
        setCalibrationPoints(prev => [...prev, newPoint]);
        setSelectedTarget(null);
        setStatus(`✅ Point Recorded at [${newPoint.x}, ${newPoint.y}]`);
    };

    const clearCalibration = () => {
        if (window.confirm("Clear all calibration data?")) {
            setCalibrationPoints([]);
            setSelectedTarget(null);
        }
    };

    // Auto-Calibrate after connection (Wait 1s for signals to stabilize)
    useEffect(() => {
        if (isConnected) {
            const timer = setTimeout(() => {
                if (latestAmplitudes.some(a => a > 0)) {
                    handleCalibrate();
                }
            }, 1000); // 1 second warmup
            return () => clearTimeout(timer);
        }
    }, [isConnected]);

    const handleCalibrate = () => {
        if (positionTrackerRef.current && recentAmplitudesRef.current.length > 0) {
            // Use the most recent valid packet for calibration
            const lastData = recentAmplitudesRef.current[recentAmplitudesRef.current.length - 1];
            positionTrackerRef.current.calibrate(lastData);
            setStatus("Auto-Calibrated Baselines!");
            setTimeout(() => setStatus("Listening..."), 2000);
        }
    };

    // DIAGNOSTICS LOGIC
    const runDiagnostics = () => {
        setIsDiagnosing(true);
        isDiagnosingRef.current = true; // Enable capture
        setStatus("DIAGNOSING... STAY STILL");
        diagnosticBufferRef.current = [];

        // Collect for 3 seconds
        setTimeout(() => {
            setIsDiagnosing(false);
            isDiagnosingRef.current = false; // Disable capture
            analyzeSamples(diagnosticBufferRef.current);
            setStatus("Diagnosis Complete");
        }, 3000);
    };

    const analyzeSamples = (buffer) => {
        if (buffer.length < 10) {
            alert("Insufficient data. Please check connection.");
            return;
        }

        const stats = [0, 1, 2, 3].map(i => {
            const values = buffer.map(frame => frame[i]);
            const min = Math.min(...values);
            const max = Math.max(...values);
            const sum = values.reduce((a, b) => a + b, 0);
            const mean = sum / values.length;
            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
            return { min, max, mean: Math.round(mean), noise: Math.round(Math.sqrt(variance)) };
        });

        // Determine Root Cause
        let rootCause = "Hardware - Clean Signal";
        let status = "GOOD";
        let evidence = "All sensors show low noise variance.";
        let recommendations = ["System appears healthy."];

        const stuckSensors = stats.filter(s => s.mean > 500 && s.noise < 50);
        const noisySensors = stats.filter(s => s.noise > 100);

        if (stuckSensors.length > 0) {
            rootCause = "Hardware - Stuck Sensor (DC Bias)";
            status = "CRITICAL";
            evidence = `Sensor(s) showing high mean DC voltage (>500) but low noise. Likely piezo bias.`;
            recommendations = [
                "Tap 'Calibrate' to zero out this offset.",
                "Check wiring for sensors showing steady high values.",
                "Ensure Raw Gate is set higher than the DC offset."
            ];
        } else if (noisySensors.length > 0) {
            rootCause = "Hardware - Electrical Noise / Floating Input";
            status = "WARNING";
            evidence = "High variance detected in signal (>100 ADC fluctuation).";
            recommendations = [
                "Increase 'Raw Amplitude Gate' to 2500+.",
                "Check grounding connections.",
                "Ensure piezos are firmly attached."
            ];
        }

        setDiagnosisReport({ status, rootCause, evidence, sensors: stats, recommendations });
    };



    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-cyan-500">
            <div className="h-16"></div>
            <main className="max-w-[1600px] mx-auto p-6">

                {/* Header */}
                <div className="bg-[#111] border border-white/10 p-4 rounded-xl mb-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center gap-3">
                            <Target /> Live Footstep Tracker
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">Real-time position tracking on 47x65cm surface</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">

                        {/* Sensitivity Slider */}
                        <div className="flex flex-col w-24 md:w-32">
                            <label className="text-xs text-gray-400 flex justify-between">
                                <span>Raw Amplitude Gate (ADC)</span>
                                <span className="text-cyan-400">{sensitivity}</span>
                            </label>
                            <input
                                type="range"
                                min="0" max="500" step="5"
                                value={sensitivity}
                                onChange={(e) => setSensitivity(Number(e.target.value))}
                                className="h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            />
                        </div>

                        {/* Focus/Sharpening Slider */}
                        <div className="flex flex-col w-24 md:w-32">
                            <label className="text-xs text-gray-400 flex justify-between">
                                <span>Focus</span>
                                <span className="text-cyan-400">{focus}</span>
                            </label>
                            <input
                                type="range"
                                min="1" max="10" step="1"
                                value={focus}
                                onChange={(e) => setFocus(Number(e.target.value))}
                                className="h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                        </div>

                        <div className="h-8 w-px bg-gray-800 mx-2 hidden md:block"></div>

                        <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-900 px-3 py-1 rounded-lg border border-gray-800">
                            <span className={isConnected ? "text-green-400 animate-pulse" : "text-gray-500"}>●</span>
                            {status}
                        </div>

                        {/* Simulator Controls */}
                        {isConnected && (
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Simulator</span>
                                <div className="flex gap-1">
                                    {[0, 1, 2, 3].map(i => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                if (positionTrackerRef.current) {
                                                    const res = positionTrackerRef.current.simulateStep(i);
                                                    if (res) {
                                                        setCurrentPosition({ ...res, timestamp: Date.now() });
                                                        setPositionHistory(p => [...p, { ...res, timestamp: Date.now() }].slice(-20));
                                                    }
                                                }
                                            }}
                                            className="px-2 py-1 bg-blue-900/50 hover:bg-blue-600 text-blue-200 text-xs rounded border border-blue-800"
                                        >
                                            P{i}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="checkbox"
                                        checked={isAutoTest}
                                        onChange={(e) => setIsAutoTest(e.target.checked)}
                                        className="accent-cyan-500 w-3 h-3"
                                    />
                                    <span className="text-[10px] text-gray-400">Auto Loop</span>
                                </div>
                            </div>
                        )}

                        {/* Diagnostics Button */}
                        <button
                            onClick={handleCalibrate}
                            className="px-3 py-2 rounded-lg font-bold bg-yellow-600/20 text-yellow-500 border border-yellow-600/50 hover:bg-yellow-600 hover:text-white transition-all text-xs uppercase"
                        >
                            Calibrate
                        </button>

                        <button
                            onClick={() => setPositionHistory([])}
                            className="px-3 py-2 rounded-lg font-bold bg-gray-800 hover:bg-gray-700 text-white transition-all text-xs uppercase"
                        >
                            Clear
                        </button>

                        <div className="h-8 w-px bg-gray-800 mx-2 hidden md:block"></div>

                        {/* Connection Method Toggle */}
                        <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
                            <button
                                onClick={() => setConnectionMethod('serial')}
                                className={`px-3 py-1 text-[10px] font-black uppercase tracking-tighter rounded-md transition-all ${connectionMethod === 'serial' ? 'bg-cyan-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Serial
                            </button>
                            <button
                                onClick={() => setConnectionMethod('websocket')}
                                className={`px-3 py-1 text-[10px] font-black uppercase tracking-tighter rounded-md transition-all ${connectionMethod === 'websocket' ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                WiFi (WS)
                            </button>
                        </div>

                        <div className="h-8 w-px bg-gray-800 mx-2 hidden md:block"></div>

                        {/* Diagnostics Button */}
                        <button
                            onClick={runDiagnostics}
                            disabled={!isConnected || isDiagnosing}
                            className={`px-3 py-2 rounded-lg font-bold border transition-all text-xs uppercase flex items-center gap-2 ${isDiagnosing
                                ? 'bg-purple-900/50 text-purple-200 border-purple-800 animate-pulse'
                                : 'bg-purple-900/20 text-purple-400 border-purple-600/50 hover:bg-purple-600 hover:text-white'
                                }`}
                        >
                            {isDiagnosing ? 'Analyzing...' : 'Run Diagnostics'}
                        </button>

                        <button
                            onClick={() => setIsCalibrationMode(!isCalibrationMode)}
                            className={`px-3 py-2 rounded-lg font-bold border transition-all text-xs uppercase flex items-center gap-2 ${isCalibrationMode
                                ? 'bg-amber-900/50 text-amber-200 border-amber-800'
                                : 'bg-amber-900/20 text-amber-400 border-amber-600/50 hover:bg-amber-600 hover:text-white'
                                }`}
                        >
                            {isCalibrationMode ? 'Calibration Active' : 'Manual Mapping Mode'}
                        </button>

                        <button
                            onClick={effectiveIsConnected
                                ? (connectionMethod === 'serial' ? disconnectSerial : disconnectWebSocket)
                                : (connectionMethod === 'serial' ? connectSerial : connectWebSocket)
                            }
                            className={`px-4 py-2 rounded-lg font-bold transition-all text-xs uppercase flex items-center gap-2 ${effectiveIsConnected
                                ? "bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500 hover:text-white"
                                : (connectionMethod === 'serial'
                                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500 hover:text-white"
                                    : "bg-purple-500/10 text-purple-400 border border-purple-500/50 hover:bg-purple-500 hover:text-white")
                                }`}
                        >
                            <PlugZap size={14} />
                            {effectiveIsConnected ? "Disconnect" : `Connect ${connectionMethod === 'serial' ? 'Serial' : 'ESP32'}`}
                        </button>
                    </div>
                </div>

                {/* DIAGNOSIS REPORT MODAL */}
                {diagnosisReport && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <div className="bg-[#111] border border-cyan-500/30 rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                        <AlertTriangle className="text-yellow-500" /> System Diagnosis Report
                                    </h2>
                                    <p className="text-gray-400 text-sm mt-1">Analysis of 300 samples (3s duration)</p>
                                </div>
                                <button onClick={() => setDiagnosisReport(null)} className="text-gray-500 hover:text-white">✕</button>
                            </div>

                            <div className="space-y-6">
                                {/* ROOT CAUSE */}
                                <div className={`p-4 rounded-xl border ${diagnosisReport.status === 'CRITICAL' ? 'bg-red-900/20 border-red-500/50' :
                                    diagnosisReport.status === 'WARNING' ? 'bg-yellow-900/20 border-yellow-500/50' :
                                        'bg-green-900/20 border-green-500/50'
                                    }`}>
                                    <h3 className="text-sm font-bold opacity-70 uppercase tracking-widest mb-1">Diagnosis Result</h3>
                                    <div className="text-xl font-bold text-white">{diagnosisReport.rootCause}</div>
                                    <p className="text-sm mt-2 opacity-90">{diagnosisReport.evidence}</p>
                                </div>

                                {/* SENSOR STATS */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {diagnosisReport.sensors.map((s, i) => (
                                        <div key={i} className="bg-gray-800 p-3 rounded-lg text-center">
                                            <div className="text-xs text-gray-500 mb-1">Sensor P{i}</div>
                                            <div className="text-lg font-mono font-bold">{s.mean}</div>
                                            <div className={`text-xs mt-1 ${s.noise > 50 ? 'text-red-400' : 'text-green-400'
                                                }`}>
                                                Noise: ±{s.noise}
                                            </div>
                                            <div className="text-[10px] text-gray-500 mt-1">
                                                Range: {s.min}-{s.max}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* RECOMMENDATION */}
                                <div className="bg-blue-900/10 border border-blue-500/30 p-4 rounded-xl">
                                    <h3 className="text-blue-400 font-bold mb-2 flex items-center gap-2">Recommended Fix</h3>
                                    <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
                                        {diagnosisReport.recommendations.map((rec, i) => (
                                            <li key={i}>{rec}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={() => setDiagnosisReport(null)}
                                    className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-bold text-sm"
                                >
                                    Close Report
                                </button>
                            </div>
                        </div>
                    </div>
                )}


                {!effectiveIsConnected && (
                    <div className="bg-purple-900/20 border border-purple-500/20 p-4 rounded-xl mb-6 flex flex-col gap-3">
                        <div className="flex items-center gap-3 text-purple-200">
                            <Activity className="w-5 h-5" />
                            <div>
                                {connectionMethod === 'serial'
                                    ? 'Connect USB cables and ensure ESP32 is flashing green.'
                                    : (
                                        <div className="text-xs text-gray-300 mt-2">
                                            <b className="text-white block mb-1">Wireless Setup Instructions:</b>
                                            1. Connect PC WiFi to <span className="text-cyan-400 font-bold">"Pranshul"</span><br />
                                            2. Password: <span className="text-cyan-400 font-bold">"Pranshul@007"</span><br />
                                            3. Ensure ESP32 is powered via USB or Battery.
                                        </div>
                                    )}
                            </div>
                        </div>

                        {connectionMethod === 'websocket' && (
                            <div className="flex flex-col gap-4 pl-8 border-t border-purple-500/10 pt-3">
                                <div className="flex items-center gap-4">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] text-purple-400 uppercase font-bold">Gateway IP</span>
                                        <input
                                            type="text"
                                            value={gatewayIp}
                                            onChange={(e) => setGatewayIp(e.target.value)}
                                            className="bg-black/40 border border-purple-500/30 rounded px-2 py-1 text-xs text-white outline-none focus:border-purple-400 w-32"
                                        />
                                    </div>
                                    <a
                                        href={`http://${gatewayIp}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] text-cyan-400 border border-cyan-400/30 px-2 py-1.5 rounded hover:bg-cyan-400/10 transition-all font-bold uppercase"
                                    >
                                        Ping Device Check
                                    </a>
                                </div>
                                <div className="text-xs text-gray-300 mt-2 p-3 bg-purple-900/30 rounded-lg border border-purple-500/30">
                                    <b className="text-white block mb-1">Wireless Setup Instructions:</b>
                                    1. Connect PC WiFi to <span className="text-cyan-400 font-bold">"Pranshul"</span><br />
                                    2. Password: <span className="text-cyan-400 font-bold">"Pranshul@007"</span><br />
                                    3. Ensure ESP32 is powered via USB or Battery.<br />
                                    {wsStatus.includes('Reconnecting') && <span className="block text-yellow-400 animate-pulse mt-2 font-bold uppercase text-[10px]">Auto-Status: {wsStatus}</span>}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Debug Monitor */}
                {isConnected && (
                    <div className="bg-gray-900 p-3 rounded-lg mb-6 font-mono text-xs text-green-400 border border-gray-700">
                        <div className="opacity-50 mb-1">RAW SERIAL FEED:</div>
                        {lastRawData}
                    </div>
                )}

                {/* PER-CHANNEL TUNING UI */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
                    <div className="lg:col-span-4 bg-gray-900/50 p-6 rounded-2xl border border-gray-800">
                        <div className="flex justify-between items-center mb-6">
                            <div className="text-sm font-bold text-gray-400 flex items-center gap-2">
                                <Sliders size={18} className="text-cyan-400" /> PER-CHANNEL SIGNAL TUNING
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const firstGain = vibrationGains[0];
                                        setVibrationGains([firstGain, firstGain, firstGain, firstGain]);
                                    }}
                                    className="bg-gray-800 hover:bg-gray-700 text-[10px] px-3 py-1.5 rounded-lg text-gray-400 border border-gray-700 transition-all uppercase tracking-wider"
                                >
                                    Sync Gains
                                </button>
                                <button
                                    onClick={() => {
                                        const firstGate = adcGates[0];
                                        setAdcGates([firstGate, firstGate, firstGate, firstGate]);
                                    }}
                                    className="bg-gray-800 hover:bg-gray-700 text-[10px] px-3 py-1.5 rounded-lg text-gray-400 border border-gray-700 transition-all uppercase tracking-wider"
                                >
                                    Sync Gates
                                </button>
                                <button onClick={resetAllDetectors} className="bg-cyan-500/10 hover:bg-cyan-500/20 text-xs px-3 py-1.5 rounded-lg text-cyan-400 flex items-center gap-2 transition-all border border-cyan-500/30 uppercase font-bold">
                                    <RotateCcw size={14} /> Recalibrate
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {[0, 1, 2, 3].map(idx => (
                                <div key={idx} className={`p-5 rounded-2xl border transition-all duration-300 ${activeChannels[idx] ? 'bg-black/40 border-gray-700 hover:border-gray-600' : 'bg-black/10 border-gray-800 opacity-40 grayscale'}`}>
                                    <div className="flex items-center justify-between mb-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ backgroundColor: ['#00eaff', '#ff6b6b', '#4ade80', '#fbbf24'][idx] }}></div>
                                            <span className="font-bold text-xs tracking-[0.2em] text-gray-400 uppercase">Sensor {idx}</span>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={activeChannels[idx]}
                                            onChange={(e) => {
                                                const newActive = [...activeChannels];
                                                newActive[idx] = e.target.checked;
                                                setActiveChannels(newActive);
                                                activeChannelsRef.current = newActive;
                                            }}
                                            className="w-4 h-4 accent-cyan-500 rounded border-gray-700 bg-gray-800"
                                        />
                                    </div>

                                    <div className="space-y-6">
                                        {/* GAIN SLIDER */}
                                        <div>
                                            <div className="flex justify-between text-[10px] mb-2 uppercase tracking-widest font-bold">
                                                <span className="text-gray-500">Multiplier</span>
                                                <span className="text-cyan-400 font-mono">{vibrationGains[idx]}x</span>
                                            </div>
                                            <input
                                                type="range" min="1" max="250" step="1"
                                                value={vibrationGains[idx]}
                                                onChange={(e) => handleChannelGainChange(idx, e.target.value)}
                                                className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                                            />
                                        </div>

                                        {/* ADC GATE SLIDER */}
                                        <div>
                                            <div className="flex justify-between text-[10px] mb-2 uppercase tracking-widest font-bold">
                                                <span className="text-gray-500">Gate</span>
                                                <span className="text-yellow-400 font-mono">±{adcGates[idx]}</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="1500" step="5"
                                                value={adcGates[idx]}
                                                onChange={(e) => handleChannelGateChange(idx, e.target.value)}
                                                className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                                            />
                                        </div>

                                        {/* MINI MONITOR */}
                                        <div className="bg-black/60 rounded-xl p-3 flex items-center justify-between border border-white/5 shadow-inner">
                                            <span className="text-[9px] text-gray-600 uppercase font-black tracking-tighter">Live ADC</span>
                                            <span className={`font-mono text-sm font-bold tabular-nums transition-colors duration-75 ${Math.abs(liveRawValues[idx] - 2048) > (adcGates[idx]) ? 'text-white' : 'text-gray-700'}`}>
                                                {liveRawValues[idx]}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Map Display Container */}
                <div className="relative bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl p-6">

                    {/* Live Sensor Values Overlay */}
                    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-4">
                        {/* Top Row */}
                        <div className="flex justify-between">
                            <SensorValueDisplay index={0} val={latestAmplitudes[0]} color="#00f2fe" />
                            <SensorValueDisplay index={1} val={latestAmplitudes[1]} color="#ff0080" />
                        </div>
                        {/* Bottom Row */}
                        <div className="flex justify-between mt-auto">
                            <SensorValueDisplay index={2} val={latestAmplitudes[2]} color="#00e676" />
                            <SensorValueDisplay index={3} val={latestAmplitudes[3]} color="#ffae00" />
                        </div>
                    </div>

                    <FootstepMap
                        positions={positionHistory}
                        latestPosition={currentPosition}
                        sensors={positionTrackerRef.current?.getSensors() || []}
                        surfaceWidth={47}
                        surfaceHeight={65}
                        onMapClick={isCalibrationMode ? handleMapClick : null}
                        calibrationPoints={calibrationPoints}
                        selectedTarget={selectedTarget}
                    />
                </div>

                {/* CALIBRATION WORKFLOW PANEL */}
                {isCalibrationMode && (
                    <div className="mt-6 bg-[#111] border border-amber-500/30 rounded-2xl p-6">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                                    <Database size={18} /> Manual Mapping Calibration
                                </h3>
                                <p className="text-gray-500 text-xs">Tap specific locations to fingerprint your surface</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={clearCalibration}
                                    className="px-3 py-1.5 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500 hover:text-white transition-all uppercase font-bold"
                                >
                                    Clear All
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Step 1: Set Target */}
                            <div className="bg-black/40 border border-white/5 p-4 rounded-xl">
                                <span className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.2em] mb-2 block">Step 1: Target</span>
                                {selectedTarget ? (
                                    <div className="flex items-center justify-between">
                                        <div className="text-2xl font-mono text-white">[{selectedTarget.x}, {selectedTarget.y}]</div>
                                        <button onClick={() => setSelectedTarget(null)} className="text-gray-500 hover:text-white text-xs">change</button>
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-500 italic">Click on the map above where you will tap</div>
                                )}
                            </div>

                            {/* Step 2: Record Tap */}
                            <div className="bg-black/40 border border-white/5 p-4 rounded-xl flex flex-col justify-center">
                                <span className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.2em] mb-2 block">Step 2: Signal</span>
                                <div className="flex flex-col gap-2">
                                    <div className="flex gap-1">
                                        {lastCalibrationAmps.map((a, i) => (
                                            <div key={i} className={`flex-1 text-[10px] border rounded p-1 text-center font-mono ${a > 0 ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-400' : 'bg-gray-900 border-white/5 text-gray-600'}`}>
                                                {Math.round(a)}
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={addCalibrationPoint}
                                        disabled={!selectedTarget}
                                        className={`w-full py-2 rounded-lg font-bold text-sm uppercase transition-all ${selectedTarget
                                            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20'
                                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                            }`}
                                    >
                                        Record Tap Data
                                    </button>
                                </div>
                            </div>

                            {/* Step 3: Dataset Info */}
                            <div className="bg-black/40 border border-white/5 p-4 rounded-xl flex flex-col justify-center">
                                <span className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.2em] mb-2 block">Status</span>
                                <div className="text-2xl font-bold text-white leading-none">
                                    {calibrationPoints.length} <span className="text-sm text-gray-500 font-normal">Points Saved</span>
                                </div>
                                <div className="text-[10px] text-gray-500 mt-1">Calibration active: Tracking will now use manual mapping weights</div>
                            </div>
                        </div>

                        {/* Point List Table */}
                        {calibrationPoints.length > 0 && (
                            <div className="mt-6 border-t border-white/5 pt-6">
                                <div className="max-h-48 overflow-y-auto pr-2">
                                    <table className="w-full text-left text-xs text-gray-400">
                                        <thead>
                                            <tr className="text-[10px] uppercase font-bold text-gray-600 border-b border-white/5">
                                                <th className="pb-2">ID</th>
                                                <th className="pb-2">Location (cm)</th>
                                                <th className="pb-2">Profile (P0-P3)</th>
                                                <th className="pb-2 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {calibrationPoints.map((pt, idx) => (
                                                <tr key={idx}>
                                                    <td className="py-2 text-amber-500">#{idx + 1}</td>
                                                    <td className="py-2 text-white font-mono">X: {pt.x}, Y: {pt.y}</td>
                                                    <td className="py-2 font-mono text-[10px]">
                                                        {pt.amplitudes.map(a => Math.round(a)).join(' | ')}
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        <button
                                                            onClick={() => setCalibrationPoints(prev => prev.filter((_, i) => i !== idx))}
                                                            className="text-red-500 hover:text-red-400 transition-colors"
                                                        >
                                                            Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </main>
        </div>
    );
};

// Helper Component for Sensor Values
const SensorValueDisplay = ({ index, val, color }) => (
    <div className="bg-black/60 backdrop-blur-sm p-2 rounded-lg border border-white/10 w-24">
        <div className="flex justify-between text-xs mb-1">
            <span className="font-bold text-gray-300">P{index}</span>
            <span className="font-mono" style={{ color }}>{val || 0}</span>
        </div>
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
                className="h-full transition-all duration-75"
                style={{ width: `${Math.min(100, (val / 4095) * 100)}%`, backgroundColor: color }}
            />
        </div>
    </div>
);

export default Tracking;
