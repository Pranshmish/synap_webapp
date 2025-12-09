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
    X,
    ChevronDown,
    ChevronRight,
    Waves,
    BarChart3,
    Grid3X3,
    RefreshCw,
    Download,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import { api } from "../config/api";

ChartJS.register(
    LineElement,
    CategoryScale,
    LinearScale,
    PointElement,
    Tooltip,
    Legend,
    Filler
);

/**
 * Signal & Wavelet Visualization Panel
 * 
 * Shows time-domain signal, FFT spectrum, and wavelet scalogram
 * for a selected footstep sample. For visualization purposes only -
 * does not modify any dataset or training logic.
 */
const SignalVisualization = ({ isOpen, onClose, initialSource = null, initialSampleId = null }) => {
    // State
    const [sources, setSources] = useState([]);
    const [selectedSource, setSelectedSource] = useState(initialSource || "");
    const [samples, setSamples] = useState([]);
    const [selectedSample, setSelectedSample] = useState(initialSampleId || "");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Visualization data
    const [visualizationData, setVisualizationData] = useState(null);

    // Settings
    const [waveletFamily, setWaveletFamily] = useState("morl");
    const [numScales, setNumScales] = useState(32);
    const [showSettings, setShowSettings] = useState(false);

    // Canvas ref for wavelet heatmap
    const waveletCanvasRef = useRef(null);

    // Cursor position for linked views
    const [cursorTime, setCursorTime] = useState(null);

    // Load sources on mount
    useEffect(() => {
        if (isOpen) {
            loadSources();
        }
    }, [isOpen]);

    // Load samples when source changes
    useEffect(() => {
        if (selectedSource) {
            loadSamples(selectedSource);
        }
    }, [selectedSource]);

    // Set initial source/sample if provided
    useEffect(() => {
        if (initialSource) {
            setSelectedSource(initialSource);
        }
        if (initialSampleId) {
            setSelectedSample(initialSampleId);
        }
    }, [initialSource, initialSampleId]);

    // Draw wavelet scalogram when data changes
    useEffect(() => {
        if (visualizationData?.wavelet && waveletCanvasRef.current) {
            drawWaveletScalogram();
        }
    }, [visualizationData]);

    const loadSources = async () => {
        try {
            const result = await api.getVisualizationSources();
            if (result.success) {
                setSources(result.sources);
                if (result.sources.length > 0 && !selectedSource) {
                    setSelectedSource(result.sources[0].name);
                }
            }
        } catch (e) {
            console.error("Failed to load sources:", e);
            setError("Failed to load dataset sources");
        }
    };

    const loadSamples = async (source) => {
        try {
            const result = await api.getVisualizationSamples(source);
            if (result.success) {
                setSamples(result.samples);
                if (result.samples.length > 0 && !selectedSample) {
                    setSelectedSample(result.samples[0].filename);
                }
            }
        } catch (e) {
            console.error("Failed to load samples:", e);
            setError("Failed to load samples");
        }
    };

    const loadVisualization = async () => {
        if (!selectedSource || !selectedSample) return;

        setIsLoading(true);
        setError(null);

        try {
            const result = await api.getSignalVisualization({
                source: selectedSource,
                sample_id: selectedSample,
                max_points: 2048,
                fft_n_points: 1024,
                wavelet: {
                    type: "cwt",
                    family: waveletFamily,
                    num_scales: numScales
                }
            });

            if (result.success) {
                setVisualizationData(result);
            } else {
                setError(result.error || "Visualization failed");
            }
        } catch (e) {
            console.error("Failed to load visualization:", e);
            setError(e.message || "Failed to load visualization");
        } finally {
            setIsLoading(false);
        }
    };

    // Load visualization when sample changes or button clicked
    useEffect(() => {
        if (selectedSource && selectedSample && isOpen) {
            loadVisualization();
        }
    }, [selectedSample]);

    const drawWaveletScalogram = () => {
        const canvas = waveletCanvasRef.current;
        if (!canvas || !visualizationData?.wavelet) return;

        const ctx = canvas.getContext('2d');
        const { power, time, frequencies } = visualizationData.wavelet;

        if (!power || power.length === 0) return;

        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Compute color mapping
        const numScales = power.length;
        const numTimePoints = power[0]?.length || 0;

        if (numTimePoints === 0) return;

        // Find min/max power for normalization
        let minPower = Infinity;
        let maxPower = -Infinity;
        for (let i = 0; i < numScales; i++) {
            for (let j = 0; j < numTimePoints; j++) {
                const val = power[i][j];
                if (val < minPower) minPower = val;
                if (val > maxPower) maxPower = val;
            }
        }

        const powerRange = maxPower - minPower || 1;

        // Draw pixels
        const pixelWidth = width / numTimePoints;
        const pixelHeight = height / numScales;

        for (let i = 0; i < numScales; i++) {
            for (let j = 0; j < numTimePoints; j++) {
                const normalizedPower = (power[i][j] - minPower) / powerRange;

                // Use a colormap (viridis-like)
                const color = getViridisColor(normalizedPower);
                ctx.fillStyle = color;

                const x = j * pixelWidth;
                const y = (numScales - 1 - i) * pixelHeight; // Flip Y so low freq at bottom

                ctx.fillRect(x, y, Math.ceil(pixelWidth), Math.ceil(pixelHeight));
            }
        }

        // Draw cursor line if hovering
        if (cursorTime !== null && time) {
            const cursorIdx = Math.round(cursorTime * (numTimePoints - 1));
            const cursorX = cursorIdx * pixelWidth;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cursorX, 0);
            ctx.lineTo(cursorX, height);
            ctx.stroke();
        }
    };

    // Viridis-like colormap function
    const getViridisColor = (t) => {
        // Simplified viridis approximation
        const r = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(t - 0.75) * 4)));
        const g = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(t - 0.5) * 3)));
        const b = Math.round(255 * Math.min(1, Math.max(0, 1 - t)));

        // Better viridis-inspired gradient
        if (t < 0.25) {
            return `rgb(${68 + t * 4 * 50}, ${1 + t * 4 * 80}, ${84 + t * 4 * 80})`;
        } else if (t < 0.5) {
            const t2 = (t - 0.25) * 4;
            return `rgb(${118 - t2 * 40}, ${81 + t2 * 80}, ${164 - t2 * 60})`;
        } else if (t < 0.75) {
            const t3 = (t - 0.5) * 4;
            return `rgb(${78 + t3 * 100}, ${161 + t3 * 40}, ${104 - t3 * 30})`;
        } else {
            const t4 = (t - 0.75) * 4;
            return `rgb(${178 + t4 * 70}, ${201 + t4 * 30}, ${74 - t4 * 40})`;
        }
    };

    // Time series chart data
    const timeSeriesChartData = visualizationData?.time_series ? {
        labels: visualizationData.time_series.t.map(t => t.toFixed(3)),
        datasets: [{
            label: 'Amplitude',
            data: visualizationData.time_series.x,
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            borderWidth: 1.5,
        }]
    } : null;

    // FFT chart data
    const fftChartData = visualizationData?.fft ? {
        labels: visualizationData.fft.freq.map(f => f.toFixed(1)),
        datasets: [{
            label: 'Magnitude',
            data: visualizationData.fft.magnitude,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            borderWidth: 1.5,
        }]
    } : null;

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
            x: {
                display: true,
                grid: { color: 'rgba(255,255,255,0.1)' },
                ticks: { color: '#9ca3af', maxTicksLimit: 10 }
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.1)' },
                ticks: { color: '#9ca3af' }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: { enabled: true }
        },
        onHover: (event, elements, chart) => {
            if (chart && event.native) {
                const rect = chart.canvas.getBoundingClientRect();
                const x = event.native.clientX - rect.left;
                const chartWidth = chart.chartArea.right - chart.chartArea.left;
                const relativeX = (x - chart.chartArea.left) / chartWidth;
                if (relativeX >= 0 && relativeX <= 1) {
                    setCursorTime(relativeX);
                }
            }
        }
    };

    const fftChartOptions = {
        ...chartOptions,
        scales: {
            ...chartOptions.scales,
            x: {
                ...chartOptions.scales.x,
                title: { display: true, text: 'Frequency (Hz)', color: '#9ca3af' }
            },
            y: {
                ...chartOptions.scales.y,
                title: { display: true, text: 'Magnitude', color: '#9ca3af' }
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden border border-gray-700 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gradient-to-r from-purple-900/50 to-blue-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                            <Waves className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Signal & Wavelet Visualization</h2>
                            <p className="text-sm text-gray-400">Time-domain, FFT spectrum, and wavelet scalogram</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Controls */}
                <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                    <div className="flex flex-wrap gap-4 items-end">
                        {/* Source selector */}
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-sm font-medium text-gray-400 mb-1">Dataset Source</label>
                            <select
                                value={selectedSource}
                                onChange={(e) => setSelectedSource(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                            >
                                <option value="">Select source...</option>
                                {sources.map(s => (
                                    <option key={s.name} value={s.name}>
                                        {s.name} ({s.waveform_count} samples)
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Sample selector */}
                        <div className="flex-1 min-w-[250px]">
                            <label className="block text-sm font-medium text-gray-400 mb-1">Sample</label>
                            <select
                                value={selectedSample}
                                onChange={(e) => setSelectedSample(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                                disabled={!selectedSource || samples.length === 0}
                            >
                                <option value="">Select sample...</option>
                                {samples.map(s => (
                                    <option key={s.filename} value={s.filename}>
                                        {s.timestamp}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Settings toggle */}
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors"
                        >
                            {showSettings ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            Settings
                        </button>

                        {/* Refresh button */}
                        <button
                            onClick={loadVisualization}
                            disabled={!selectedSource || !selectedSample || isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            {isLoading ? 'Loading...' : 'Visualize'}
                        </button>
                    </div>

                    {/* Settings panel */}
                    {showSettings && (
                        <div className="mt-4 p-4 bg-gray-700/50 rounded-lg">
                            <div className="flex flex-wrap gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Wavelet Family</label>
                                    <select
                                        value={waveletFamily}
                                        onChange={(e) => setWaveletFamily(e.target.value)}
                                        className="bg-gray-600 border border-gray-500 rounded px-3 py-1 text-white"
                                    >
                                        <option value="morl">Morlet (morl)</option>
                                        <option value="cmor">Complex Morlet (cmor)</option>
                                        <option value="gaus1">Gaussian (gaus1)</option>
                                        <option value="mexh">Mexican Hat (mexh)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Num Scales</label>
                                    <select
                                        value={numScales}
                                        onChange={(e) => setNumScales(parseInt(e.target.value))}
                                        className="bg-gray-600 border border-gray-500 rounded px-3 py-1 text-white"
                                    >
                                        <option value={16}>16</option>
                                        <option value={32}>32</option>
                                        <option value={64}>64</option>
                                        <option value={128}>128</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Error display */}
                {error && (
                    <div className="mx-4 mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
                        {error}
                    </div>
                )}

                {/* Visualization content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {!visualizationData && !isLoading && (
                        <div className="flex items-center justify-center h-64 text-gray-500">
                            <div className="text-center">
                                <Waves className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p>Select a source and sample to visualize</p>
                            </div>
                        </div>
                    )}

                    {visualizationData && (
                        <>
                            {/* Sample info */}
                            {visualizationData.sample_info && (
                                <div className="flex flex-wrap gap-4 text-sm text-gray-400 bg-gray-800/50 p-3 rounded-lg">
                                    <span>Source: <span className="text-white">{visualizationData.sample_info.source}</span></span>
                                    <span>Points: <span className="text-white">{visualizationData.sample_info.num_points}</span></span>
                                    <span>Duration: <span className="text-white">{visualizationData.sample_info.duration_sec?.toFixed(3)}s</span></span>
                                    <span>Sample Rate: <span className="text-white">{visualizationData.sample_info.sampling_rate} Hz</span></span>
                                    <span>Wavelet: <span className={visualizationData.sample_info.wavelet_available ? "text-green-400" : "text-yellow-400"}>
                                        {visualizationData.sample_info.wavelet_available ? "Available" : "Not installed"}
                                    </span></span>
                                </div>
                            )}

                            {/* Time-domain plot */}
                            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                                <div className="flex items-center gap-2 mb-3">
                                    <Activity className="w-4 h-4 text-green-400" />
                                    <h3 className="text-white font-semibold">Time-Domain Signal (Raw Waveform)</h3>
                                </div>
                                <div className="h-48">
                                    {timeSeriesChartData ? (
                                        <Line data={timeSeriesChartData} options={chartOptions} />
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-500">No data</div>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    Shows the actual footstep vibration waveform shape over time.
                                </p>
                            </div>

                            {/* FFT spectrum */}
                            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                                <div className="flex items-center gap-2 mb-3">
                                    <BarChart3 className="w-4 h-4 text-blue-400" />
                                    <h3 className="text-white font-semibold">FFT Frequency Spectrum</h3>
                                </div>
                                <div className="h-48">
                                    {fftChartData ? (
                                        <Line data={fftChartData} options={fftChartOptions} />
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-500">No data</div>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    Shows frequency content of the footstep - which frequencies have the most energy.
                                </p>
                            </div>

                            {/* Wavelet scalogram */}
                            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                                <div className="flex items-center gap-2 mb-3">
                                    <Grid3X3 className="w-4 h-4 text-purple-400" />
                                    <h3 className="text-white font-semibold">Wavelet Scalogram (Time-Frequency)</h3>
                                    {!visualizationData.wavelet && (
                                        <span className="text-xs text-yellow-400 ml-2">(Install PyWavelets to enable)</span>
                                    )}
                                </div>
                                {visualizationData.wavelet ? (
                                    <>
                                        <div className="relative bg-gray-900 rounded-lg overflow-hidden">
                                            <canvas
                                                ref={waveletCanvasRef}
                                                width={800}
                                                height={200}
                                                className="w-full h-48"
                                            />
                                            {/* Y-axis label */}
                                            <div className="absolute left-0 top-0 bottom-0 w-16 flex items-center justify-center">
                                                <span className="text-xs text-gray-400 -rotate-90 whitespace-nowrap">Frequency →</span>
                                            </div>
                                            {/* X-axis label */}
                                            <div className="absolute bottom-0 left-0 right-0 text-center">
                                                <span className="text-xs text-gray-400">Time →</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                            <span>Family: {visualizationData.wavelet.wavelet_family}</span>
                                            <span>Scales: {visualizationData.wavelet.num_scales}</span>
                                            <div className="flex items-center gap-1">
                                                <span>Power:</span>
                                                <div className="flex">
                                                    <div className="w-4 h-3 rounded-l" style={{ background: getViridisColor(0) }}></div>
                                                    <div className="w-4 h-3" style={{ background: getViridisColor(0.33) }}></div>
                                                    <div className="w-4 h-3" style={{ background: getViridisColor(0.66) }}></div>
                                                    <div className="w-4 h-3 rounded-r" style={{ background: getViridisColor(1) }}></div>
                                                </div>
                                                <span>Low → High</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">
                                            Shows how frequency content changes over time. Bright spots indicate where the footstep impact occurs -
                                            demonstrates why wavelets provide "next-level" analysis compared to plain FFT.
                                        </p>
                                    </>
                                ) : (
                                    <div className="h-48 flex items-center justify-center text-gray-500 bg-gray-900 rounded-lg">
                                        <div className="text-center">
                                            <Grid3X3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            <p>Wavelet analysis requires PyWavelets</p>
                                            <p className="text-xs mt-1">pip install PyWavelets</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* MFCC Visualization */}
                            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                                <div className="flex items-center gap-2 mb-3">
                                    <BarChart3 className="w-4 h-4 text-orange-400" />
                                    <h3 className="text-white font-semibold">MFCC (Mel-Frequency Cepstral Coefficients)</h3>
                                </div>
                                {visualizationData.mfcc ? (
                                    <>
                                        <div className="relative bg-gray-900 rounded-lg overflow-hidden">
                                            <canvas
                                                id="mfccCanvas"
                                                width={800}
                                                height={150}
                                                className="w-full h-36"
                                                ref={(canvas) => {
                                                    if (canvas && visualizationData.mfcc) {
                                                        const ctx = canvas.getContext('2d');
                                                        const data = visualizationData.mfcc.coefficients;
                                                        if (!data || data.length === 0) return;

                                                        const width = canvas.width;
                                                        const height = canvas.height;
                                                        ctx.clearRect(0, 0, width, height);

                                                        const nMfcc = data.length;
                                                        const nFrames = data[0]?.length || 1;
                                                        const cellW = width / nFrames;
                                                        const cellH = height / nMfcc;

                                                        // Find min/max for normalization
                                                        let min = Infinity, max = -Infinity;
                                                        data.forEach(row => row.forEach(v => {
                                                            if (v < min) min = v;
                                                            if (v > max) max = v;
                                                        }));
                                                        const range = max - min || 1;

                                                        // Draw heatmap
                                                        for (let r = 0; r < nMfcc; r++) {
                                                            for (let c = 0; c < nFrames; c++) {
                                                                const val = (data[r][c] - min) / range;
                                                                const hue = 30 + val * 30; // Orange gradient
                                                                const light = 20 + val * 50;
                                                                ctx.fillStyle = `hsl(${hue}, 80%, ${light}%)`;
                                                                ctx.fillRect(c * cellW, (nMfcc - 1 - r) * cellH, cellW + 1, cellH + 1);
                                                            }
                                                        }
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                            <span>Coefficients: {visualizationData.mfcc.n_mfcc}</span>
                                            <span>Frames: {visualizationData.mfcc.n_frames}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">
                                            MFCC captures the spectral envelope of the footstep - useful for distinguishing different walking patterns.
                                        </p>
                                    </>
                                ) : (
                                    <div className="h-36 flex items-center justify-center text-gray-500 bg-gray-900 rounded-lg">
                                        <p>No MFCC data available</p>
                                    </div>
                                )}
                            </div>

                            {/* LIF Neuron Response */}
                            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                                <div className="flex items-center gap-2 mb-3">
                                    <Activity className="w-4 h-4 text-emerald-400" />
                                    <h3 className="text-white font-semibold">LIF Neuron Response (Neuromorphic)</h3>
                                </div>
                                {visualizationData.lif ? (
                                    <>
                                        <div className="h-48">
                                            <Line
                                                data={{
                                                    labels: visualizationData.lif.time?.map(t => t.toFixed(3)),
                                                    datasets: [
                                                        {
                                                            label: "Membrane Potential",
                                                            data: visualizationData.lif.membrane,
                                                            borderColor: "#10b981",
                                                            backgroundColor: "rgba(16, 185, 129, 0.1)",
                                                            borderWidth: 1.5,
                                                            pointRadius: 0,
                                                            fill: true,
                                                            tension: 0.1
                                                        },
                                                        {
                                                            label: "Spikes",
                                                            data: visualizationData.lif.spikes?.map((s, i) =>
                                                                s > 0 ? visualizationData.lif.threshold * 1.5 : null
                                                            ),
                                                            borderColor: "#ef4444",
                                                            backgroundColor: "#ef4444",
                                                            borderWidth: 0,
                                                            pointRadius: 3,
                                                            pointStyle: "circle",
                                                            fill: false,
                                                            showLine: false
                                                        }
                                                    ]
                                                }}
                                                options={{
                                                    ...chartOptions,
                                                    plugins: {
                                                        ...chartOptions.plugins,
                                                        annotation: {
                                                            annotations: {
                                                                threshold: {
                                                                    type: 'line',
                                                                    yMin: visualizationData.lif.threshold,
                                                                    yMax: visualizationData.lif.threshold,
                                                                    borderColor: '#ef4444',
                                                                    borderWidth: 1,
                                                                    borderDash: [5, 5]
                                                                }
                                                            }
                                                        }
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                            <span>Spike Count: <span className="text-emerald-400 font-bold">{visualizationData.lif.spike_count}</span></span>
                                            <span>Spike Rate: <span className="text-emerald-400">{visualizationData.lif.spike_rate?.toFixed(2)} Hz</span></span>
                                            <span>Threshold: {visualizationData.lif.threshold}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">
                                            LIF (Leaky Integrate-and-Fire) simulates how biological neurons respond to the footstep - spikes indicate energy bursts.
                                        </p>
                                    </>
                                ) : (
                                    <div className="h-48 flex items-center justify-center text-gray-500 bg-gray-900 rounded-lg">
                                        <p>No LIF data available</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SignalVisualization;
