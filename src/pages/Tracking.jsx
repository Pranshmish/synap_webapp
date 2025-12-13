import React, { useState, useEffect, useRef, memo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

// Fallback for missing data
const initialJson = '{\n  "timestamp_ms": 1733919231000,\n  "fs": 2000,\n  "samples": 30,\n  "channels": {\n    "c1": [0,0],\n    "c2": [0,0],\n    "c3": [0,0],\n    "c4": [0,0],\n    "c5": [0,0],\n    "c6": [0,0]\n  }\n}';

const API_URL = "http://localhost:8000";

// Memoized Chart to prevent re-renders on every timeline tick
const SignalChart = memo(({ chartData }) => {
    if (!chartData) return <div className="h-full flex items-center justify-center text-gray-700 text-xs">No Data</div>;
    return (
        <div className="flex-1 min-h-0 relative h-full w-full">
            <Line data={chartData} options={{
                responsive: true, maintainAspectRatio: false, animation: false,
                scales: { x: { display: false }, y: { display: false, grid: { color: '#333' } } },
                plugins: { legend: { display: false } },
                elements: { point: { radius: 0 } }
            }} />
        </div>
    );
});

const Tracking = () => {
    // State
    const [jsonInput, setJsonInput] = useState(initialJson);
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showDebug, setShowDebug] = useState(false);
    const [time, setTime] = useState(0); // Timeline % (0-100)
    const [isPlaying, setIsPlaying] = useState(false);

    // Map controls
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [manualInputs, setManualInputs] = useState({ Piezo1: 0.1, Piezo2: 0, Piezo3: 0, Piezo4: 0, Piezo5: 0, Piezo6: 0 });

    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const mapCanvasRef = useRef(null);
    const animationFrameRef = useRef();

    // Chart Data State
    const [chartData, setChartData] = useState(null);

    // Playback Logic
    useEffect(() => {
        if (isPlaying && results && results.persons) {
            // Find global time bounds
            let maxTime = 0;
            let minTime = Infinity;
            let hasTime = false;

            results.persons.forEach(p => {
                if (p.times && p.times.length > 0) {
                    hasTime = true;
                    const start = p.times[0];
                    const end = p.times[p.times.length - 1];
                    if (start < minTime) minTime = start;
                    if (end > maxTime) maxTime = end;
                }
            });

            // Duration in seconds (fallback to 10s if logic fails)
            const duration = (hasTime && maxTime > minTime) ? (maxTime - minTime) : 10.0;
            const safeDuration = Math.max(duration, 2.0); // Min 2s for visibility

            let lastTime = Date.now();
            const animate = () => {
                const now = Date.now();
                const delta = (now - lastTime) / 1000.0; // Seconds
                lastTime = now;

                // Calculate percentage increment: (delta_sec / total_duration_sec) * 100
                const increment = (delta / safeDuration) * 100;

                setTime(prev => {
                    const next = prev + increment;
                    if (next >= 100) {
                        setIsPlaying(false);
                        return 100; // Stop exactly at end
                    }
                    return next;
                });
                animationFrameRef.current = requestAnimationFrame(animate);
            };
            animationFrameRef.current = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(animationFrameRef.current);
        }
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, [isPlaying, results]);


    // Initial Load & Parsing for Chart
    useEffect(() => {
        try {
            const parsed = JSON.parse(jsonInput);
            if (parsed.channels) {
                const channelKeys = Object.keys(parsed.channels);
                const labels = Array.from({ length: parsed.channels[channelKeys[0]].length }, (_, i) => i);
                const datasets = channelKeys.map((key, index) => {
                    const colors = ['#00f2fe', '#4facfe', '#ff0080', '#ff3b30', '#00e676', '#f5d300'];
                    return {
                        label: key.toUpperCase(),
                        data: parsed.channels[key],
                        borderColor: colors[index % colors.length],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.4,
                        normalized: true // Optimize
                    };
                });
                setChartData({ labels, datasets });
            }
        } catch (e) { }
    }, [jsonInput]);

    // Handlers
    // Handlers
    const handleGenSingle = async () => { await fetchAndProcess(`${API_URL}/tracking/generate_single_person`); };
    const handleGenTwo = async () => { await fetchAndProcess(`${API_URL}/tracking/generate_test_data`); };
    const handleGenOverlap = async () => { await fetchAndProcess(`${API_URL}/tracking/generate_overlap`); };
    const handleGenReal = async () => { await fetchAndProcess(`${API_URL}/tracking/generate_real_test_data`); };

    // New Generators
    const handleGenStopGo = async () => { await fetchAndProcess(`${API_URL}/tracking/generate_stop_go`); };
    const handleGenCircle = async () => { await fetchAndProcess(`${API_URL}/tracking/generate_circle`); };
    const handleGenThree = async () => { await fetchAndProcess(`${API_URL}/tracking/generate_three_persons`); };

    const handleClear = () => { setResults(null); setJsonInput(''); setChartData(null); setIsPlaying(false); setTime(0); };

    // Play/Pause
    const togglePlay = () => {
        if (time >= 100) setTime(0);
        setIsPlaying(!isPlaying);
    }

    const handleAddManualPoint = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/tracking/process_manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(manualInputs)
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setResults(prev => {
                // If appending to existing, logic would be complex. For now, replace.
                return data;
            });
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    const fetchAndProcess = async (url) => {
        setLoading(true);
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setJsonInput(JSON.stringify(data, null, 2));
            handleProcess(data);
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    const handleProcess = async (dataPayload = null) => {
        setLoading(true);
        setError(null);
        try {
            const payload = dataPayload || JSON.parse(jsonInput);
            const res = await fetch(`${API_URL}/tracking/process_json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setResults(data);
            setTime(0);
            setIsPlaying(true); // Auto-play on load
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    // Draw Helper: Footprint
    const drawFootprint = (ctx, x, y, angle, color) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.scale(0.8, 0.8); // Adjust size relative to grid

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.8;

        // Sole
        ctx.beginPath();
        ctx.ellipse(0, -5, 6, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Heel
        ctx.beginPath();
        ctx.ellipse(0, 8, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // Visualization: Map
    useEffect(() => {
        const canvas = mapCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        const tx = isNaN(pan.x) ? 0 : pan.x;
        const ty = isNaN(pan.y) ? 0 : pan.y;
        const s = isNaN(zoom) ? 1 : zoom;
        ctx.translate(tx, ty);
        ctx.scale(s, s);

        // Grid
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
            const pos = i * (width / 10);
            ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, height); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(width, pos); ctx.stroke();
        }

        const scaleX = width / 10;
        const scaleY = height / 10;

        // Draw Sensors
        const sensors = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 0], [5, 10]];
        sensors.forEach((s, i) => {
            const x = s[0] * scaleX;
            const y = (10 - s[1]) * scaleY;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, 15);
            grad.addColorStop(0, 'rgba(0, 242, 254, 0.4)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#00f2fe'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#888'; ctx.font = '10px Arial'; ctx.fillText(`S${i + 1}`, x + 10, y + 4);
        });

        // Draw Tracks
        if (results && results.persons) {
            results.persons.forEach(person => {
                const color = person.color || '#fff';
                const fullPath = person.smoothed || person.trajectory;
                if (!fullPath || fullPath.length === 0) return;

                const times = person.times; // Array of timestamps from backend

                let currentPath = [];

                if (times && times.length === fullPath.length) {
                    // Time-based filtering
                    // 1. Calculate Global Time Range again (same as playback loop)
                    let globalMin = Infinity;
                    let globalMax = -Infinity;
                    results.persons.forEach(p2 => {
                        if (p2.times && p2.times.length) {
                            if (p2.times[0] < globalMin) globalMin = p2.times[0];
                            if (p2.times[p2.times.length - 1] > globalMax) globalMax = p2.times[p2.times.length - 1];
                        }
                    });
                    if (globalMin === Infinity) { globalMin = 0; globalMax = 10; } // Fallback

                    const span = globalMax - globalMin;
                    const safeSpan = Math.max(span, 0.1);
                    // Current simulation time in 'seconds-ish' units
                    const currentTimeVal = globalMin + (safeSpan * (time / 100));

                    // Filter: show points that occurred at or before this time
                    currentPath = fullPath.filter((_, i) => times[i] <= currentTimeVal);

                } else {
                    // Legacy/Fallback Logic (Index based)
                    const limitIndex = Math.floor((fullPath.length - 1) * (time / 100));
                    const endIndex = Math.max(0, limitIndex);
                    currentPath = fullPath.slice(0, endIndex + 1);
                }

                if (currentPath.length > 0) {
                    // Footprints along the path (No detailed joining line)
                    currentPath.forEach((p, idx) => {
                        let x = p[0] * scaleX;
                        let y = (10 - p[1]) * scaleY;

                        let angle = 0;
                        let dx = 0, dy = 0;

                        // Calculate orientation based on full path to keep it stable
                        if (idx < fullPath.length - 1) {
                            const next = fullPath[idx + 1];
                            dx = (next[0] * scaleX) - x;
                            dy = ((10 - next[1]) * scaleY) - y;
                            angle = Math.atan2(dy, dx) + Math.PI / 2;
                        } else if (idx > 0) {
                            const prev = fullPath[idx - 1];
                            dx = x - (prev[0] * scaleX);
                            dy = y - ((10 - prev[1]) * scaleY);
                            angle = Math.atan2(dy, dx) + Math.PI / 2;
                        }

                        // Lateral Offset for Left/Right Foot simulation
                        // We need the PERPENDICULAR vector to the direction of motion.
                        // Motion: (dx, dy).
                        // Perpendiculars: (-dy, dx) or (dy, -dx).

                        const mag = Math.sqrt(dx * dx + dy * dy) || 1;
                        // Avoid division by zero or extremely small vectors
                        if (mag > 0.001) {
                            const sideScale = 15; // Amount to offset (pixels)
                            const sideX = (-dy / mag) * sideScale;
                            const sideY = (dx / mag) * sideScale;

                            // Alternate left/right based on index
                            if (idx % 2 === 0) {
                                x += sideX;
                                y += sideY;
                            } else {
                                x -= sideX;
                                y -= sideY;
                            }
                        }


                        drawFootprint(ctx, x, y, angle, color);
                    });

                    // Current Label
                    const last = currentPath[currentPath.length - 1];
                    const lx = last[0] * scaleX;
                    const ly = (10 - last[1]) * scaleY;
                    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Sans-Serif'; ctx.textAlign = 'center';
                    ctx.fillText(`P${person.id}`, lx, ly - 20);
                }
            });
        }
        ctx.restore();
    }, [results, zoom, pan, time]);

    // Mouse Controls
    const handleMouseDown = (e) => { isDragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY }; };
    const handleMouseMove = (e) => {
        if (!isDragging.current) return;
        setPan(p => ({ x: p.x + (e.clientX - lastPos.current.x), y: p.y + (e.clientY - lastPos.current.y) }));
        lastPos.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = () => { isDragging.current = false; };
    useEffect(() => {
        const canvas = mapCanvasRef.current;
        if (!canvas) return;
        const onWheel = (e) => {
            e.preventDefault(); // non-passive now works
            const s = Math.exp(-e.deltaY * 0.001);
            setZoom(z => Math.max(0.5, Math.min(5, z * s)));
        };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        // Touch gestures for mobile if needed, but wheel is mouse only
        return () => canvas.removeEventListener('wheel', onWheel);
    }, []);

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-cyan-500">
            <div className="h-16"></div>
            <main className="max-w-[1600px] mx-auto p-6">

                {/* Top Control Bar */}
                <div className="bg-[#111] border border-white/10 p-4 rounded-xl mb-6 flex flex-wrap gap-4 items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">Tracking Simulator</h1>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        <button onClick={handleGenSingle} disabled={loading} className="px-3 py-1 bg-gray-800 hover:bg-cyan-900 border border-cyan-500/30 rounded text-cyan-400 text-xs font-semibold transition-all">Single</button>
                        <button onClick={handleGenTwo} disabled={loading} className="px-3 py-1 bg-gray-800 hover:bg-blue-900 border border-blue-500/30 rounded text-blue-400 text-xs font-semibold transition-all">XB</button>
                        <button onClick={handleGenOverlap} disabled={loading} className="px-3 py-1 bg-gray-800 hover:bg-yellow-900 border border-yellow-500/30 rounded text-yellow-400 text-xs font-semibold transition-all">Overlap</button>
                        <button onClick={handleGenStopGo} disabled={loading} className="px-3 py-1 bg-gray-800 hover:bg-purple-900 border border-purple-500/30 rounded text-purple-400 text-xs font-semibold transition-all">Stop-Go</button>
                        <button onClick={handleGenCircle} disabled={loading} className="px-3 py-1 bg-gray-800 hover:bg-indigo-900 border border-indigo-500/30 rounded text-indigo-400 text-xs font-semibold transition-all">Circle</button>
                        <button onClick={handleGenThree} disabled={loading} className="px-3 py-1 bg-gray-800 hover:bg-orange-900 border border-orange-500/30 rounded text-orange-400 text-xs font-semibold transition-all">3-Pers</button>
                        <button onClick={handleGenReal} disabled={loading} className="px-3 py-1 bg-gray-800 hover:bg-pink-900 border border-pink-500/30 rounded text-pink-400 text-xs font-semibold transition-all">Real</button>

                        <div className="w-px bg-white/20 mx-1"></div>
                        <button onClick={togglePlay} className="px-3 py-1 bg-green-900/20 hover:bg-green-900/40 text-green-400 text-xs rounded transition-all min-w-[50px]">
                            {isPlaying ? 'Pause' : 'Play'}
                        </button>
                        <button onClick={handleClear} className="px-3 py-1 bg-red-900/20 hover:bg-red-900/40 text-red-400 text-xs rounded transition-all">Cl</button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[75vh]">

                    {/* LEFT: SIMULATOR & MANUAL INPUT (1/4) */}
                    <div className="space-y-6">
                        {/* Timeline */}
                        <div className="bg-[#0a0a0a] border border-white/10 p-4 rounded-2xl">
                            <h3 className="text-gray-400 text-xs font-bold uppercase mb-2">Simulation Timeline</h3>
                            <input
                                type="range" min="0" max="100" value={time}
                                onChange={(e) => { setIsPlaying(false); setTime(Number(e.target.value)); }}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            />
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>Start</span>
                                <span>{Math.round(time)}%</span>
                                <span>End</span>
                            </div>
                        </div>

                        {/* Manual Point Entry */}
                        <div className="bg-[#0a0a0a] border border-white/10 p-4 rounded-2xl">
                            <h3 className="text-gray-400 text-xs font-bold uppercase mb-3">Manual Data Point</h3>
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                {Object.keys(manualInputs).map(k => (
                                    <div key={k}>
                                        <label className="text-[10px] text-gray-500 block">{k}</label>
                                        <input
                                            type="number" step="0.1"
                                            value={manualInputs[k]}
                                            onChange={e => setManualInputs({ ...manualInputs, [k]: parseFloat(e.target.value) })}
                                            className="w-full bg-black border border-white/10 rounded px-2 py-1 text-xs"
                                        />
                                    </div>
                                ))}
                            </div>
                            <button onClick={handleAddManualPoint} disabled={loading} className="w-full py-2 bg-green-900/20 border border-green-500/30 text-green-400 text-xs rounded hover:bg-green-900/40">
                                Add Data Point
                            </button>
                        </div>

                        {/* Stats */}
                        <div className="bg-[#0a0a0a] border border-white/10 p-4 rounded-2xl flex-1 overflow-auto custom-scrollbar">
                            <h3 className="text-gray-400 text-xs font-bold uppercase mb-2">Results</h3>
                            {!results ? <p className="text-gray-600 text-xs italic">No simulation loaded.</p> : (
                                <div className="space-y-2">
                                    {results.persons?.map(p => (
                                        <div key={p.id} style={{ borderLeftColor: p.color }} className="border-l-2 pl-2 py-1 bg-white/5 rounded text-xs">
                                            <div className="font-bold text-gray-300">Person {p.id}</div>
                                            <div className="text-gray-500">{p.footsteps_detected} steps</div>
                                            <div className="text-cyan-600 font-mono text-[10px] truncate">
                                                {p.smoothed[p.smoothed.length - 1] ? `[${p.smoothed[p.smoothed.length - 1][0].toFixed(1)}, ${p.smoothed[p.smoothed.length - 1][1].toFixed(1)}]` : 'N/A'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CENTER: MAP (2/4) */}
                    <div className="lg:col-span-2 bg-[#0a0a0a] border border-white/10 rounded-2xl relative overflow-hidden">
                        <canvas
                            ref={mapCanvasRef}
                            width={800} height={800}
                            className="w-full h-full object-cover cursor-move"
                            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                        />
                        <div className="absolute bottom-4 right-4 text-xs bg-black/50 px-2 py-1 rounded text-gray-500">
                            Scroll to Zoom • Drag to Pan
                        </div>
                    </div>

                    {/* RIGHT: CHART (1/4) */}
                    <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-4 flex flex-col">
                        <h3 className="text-gray-400 text-xs font-bold uppercase mb-2">Signal Monitor</h3>
                        <SignalChart chartData={chartData} />
                    </div>

                </div>

                {/* Legacy Debug Toggle */}
                <div className="mt-4 text-center">
                    <button onClick={() => setShowDebug(!showDebug)} className="text-xs text-gray-700 hover:text-gray-500">
                        {showDebug ? 'Hide Debug' : 'Show Advanced Debug'}
                    </button>
                </div>
                {showDebug && (
                    <div className="mt-4 p-4 bg-black border border-white/10 rounded">
                        <textarea value={jsonInput} onChange={e => setJsonInput(e.target.value)} className="w-full h-32 bg-transparent text-xs text-green-500 font-mono" />
                        <button onClick={() => handleProcess()} className="mt-2 px-4 py-1 bg-gray-800 text-xs rounded">Run Raw JSON</button>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Tracking;
