import React from 'react';
import { MapPin, Target } from 'lucide-react';

/**
 * FootstepMap - Live 2D visualization of footstep positions
 * Shows an 80x60cm surface with 4 sensors and detected footstep locations
 */
const FootstepMap = ({
    positions = [],
    latestPosition = null,
    sensors = [],
    surfaceWidth = 80,
    surfaceHeight = 60,
    onMapClick = null,
    calibrationPoints = [],
    selectedTarget = null
}) => {
    const PIEZO_COLORS = ['#00eaff', '#ff6b6b', '#4ade80', '#fbbf24'];
    const scale = 8; // 8px per cm
    const displayWidth = surfaceWidth * scale;
    const displayHeight = surfaceHeight * scale;

    const handleSvgClick = (e) => {
        if (!onMapClick) return;
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();

        // Calculate relative coordinates in cm
        const x = (e.clientX - rect.left) / (rect.width / surfaceWidth);
        const y = (e.clientY - rect.top) / (rect.height / surfaceHeight);

        onMapClick({
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10
        });
    };

    return (
        <div className="footstep-map bg-gray-800/50 rounded-xl p-4 border border-cyan-700/50">
            <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-5 text-cyan-400" />
                <span className="font-semibold">Footstep Position Map ({surfaceWidth}×{surfaceHeight}cm)</span>
            </div>

            <div className="relative bg-gray-900 rounded-lg overflow-hidden"
                style={{ width: displayWidth, height: displayHeight }}>
                <svg
                    width={displayWidth}
                    height={displayHeight}
                    viewBox={`0 0 ${surfaceWidth} ${surfaceHeight}`}
                    className={`w-full h-full ${onMapClick ? 'cursor-crosshair' : ''}`}
                    onClick={handleSvgClick}
                >
                    {/* Grid lines */}
                    <defs>
                        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.2" />
                        </pattern>
                    </defs>
                    <rect width={surfaceWidth} height={surfaceHeight} fill="url(#grid)" />

                    {/* Surface border */}
                    <rect
                        width={surfaceWidth}
                        height={surfaceHeight}
                        fill="none"
                        stroke="rgba(0,234,255,0.3)"
                        strokeWidth="0.5"
                    />

                    {/* Calibration Points */}
                    {calibrationPoints.map((pt, idx) => (
                        <g key={`cal-${idx}`}>
                            <rect
                                x={pt.x - 1}
                                y={pt.y - 1}
                                width="2"
                                height="2"
                                fill="rgba(251, 191, 36, 0.4)"
                                stroke="#fbbf24"
                                strokeWidth="0.2"
                            />
                            <text
                                x={pt.x}
                                y={pt.y + 3}
                                fill="#fbbf24"
                                fontSize="2"
                                textAnchor="middle"
                            >
                                {idx + 1}
                            </text>
                        </g>
                    ))}

                    {/* Center crosshair */}
                    <line
                        x1={surfaceWidth / 2 - 5}
                        y1={surfaceHeight / 2}
                        x2={surfaceWidth / 2 + 5}
                        y2={surfaceHeight / 2}
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth="0.3"
                    />
                    <line
                        x1={surfaceWidth / 2}
                        y1={surfaceHeight / 2 - 5}
                        x2={surfaceWidth / 2}
                        y2={surfaceHeight / 2 + 5}
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth="0.3"
                    />

                    {/* Sensors */}
                    {sensors.map((sensor, idx) => (
                        <g key={idx}>
                            <circle
                                cx={sensor.x}
                                cy={sensor.y}
                                r="2"
                                fill={PIEZO_COLORS[idx]}
                                stroke="#000"
                                strokeWidth="0.2"
                            />
                            <text
                                x={sensor.x}
                                y={sensor.y - 3}
                                fill={PIEZO_COLORS[idx]}
                                fontSize="3"
                                textAnchor="middle"
                                fontWeight="bold"
                            >
                                {sensor.name}
                            </text>
                        </g>
                    ))}

                    {/* Manual Mapping Target Selection */}
                    {selectedTarget && (
                        <g>
                            <circle
                                cx={selectedTarget.x}
                                cy={selectedTarget.y}
                                r="4"
                                fill="none"
                                stroke="#3b82f6"
                                strokeWidth="0.5"
                                strokeDasharray="1 1"
                            >
                                <animate
                                    attributeName="r"
                                    from="3"
                                    to="6"
                                    dur="1.5s"
                                    repeatCount="indefinite"
                                />
                            </circle>
                            <line
                                x1={selectedTarget.x - 3} y1={selectedTarget.y}
                                x2={selectedTarget.x + 3} y2={selectedTarget.y}
                                stroke="#3b82f6" strokeWidth="0.3"
                            />
                            <line
                                x1={selectedTarget.x} y1={selectedTarget.y - 3}
                                x2={selectedTarget.x} y2={selectedTarget.y + 3}
                                stroke="#3b82f6" strokeWidth="0.3"
                            />
                        </g>
                    )}

                    {/* Latest position */}
                    {latestPosition && (
                        <g>
                            {/* Pulse effect */}
                            <circle
                                cx={latestPosition.x}
                                cy={latestPosition.y}
                                r="4"
                                fill="none"
                                stroke="red"
                                strokeWidth="0.5"
                                opacity="0.6"
                            >
                                <animate
                                    attributeName="r"
                                    from="4"
                                    to="8"
                                    dur="1s"
                                    repeatCount="indefinite"
                                />
                                <animate
                                    attributeName="opacity"
                                    from="0.6"
                                    to="0"
                                    dur="1s"
                                    repeatCount="indefinite"
                                />
                            </circle>

                            {/* Main marker */}
                            <circle
                                cx={latestPosition.x}
                                cy={latestPosition.y}
                                r="3"
                                fill="red"
                                stroke="white"
                                strokeWidth="0.4"
                            />

                            {/* Position label */}
                            <text
                                x={latestPosition.x}
                                y={latestPosition.y + 8}
                                fill="white"
                                fontSize="2.5"
                                textAnchor="middle"
                                fontWeight="bold"
                            >
                                ({latestPosition.x}, {latestPosition.y})
                            </text>
                        </g>
                    )}
                </svg>
            </div>

            {/* Position info */}
            {latestPosition && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="bg-gray-900/50 p-2 rounded">
                        <div className="text-gray-400 text-xs">Position X</div>
                        <div className="text-cyan-400 font-bold">{latestPosition.x} cm</div>
                    </div>
                    <div className="bg-gray-900/50 p-2 rounded">
                        <div className="text-gray-400 text-xs">Position Y</div>
                        <div className="text-cyan-400 font-bold">{latestPosition.y} cm</div>
                    </div>
                    <div className="bg-gray-900/50 p-2 rounded">
                        <div className="text-gray-400 text-xs">Confidence</div>
                        <div className={`font-bold ${latestPosition.confidence > 5 ? 'text-green-400' :
                            latestPosition.confidence > 2 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                            {latestPosition.confidence.toFixed(1)}/10
                        </div>
                    </div>
                </div>
            )}

            {!latestPosition && (
                <div className="mt-3 text-center text-gray-500 text-sm py-4">
                    <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Waiting for footsteps...
                </div>
            )}
        </div>
    );
};

export default FootstepMap;
