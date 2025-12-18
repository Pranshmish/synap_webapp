import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for robust ESP32 WebSocket connectivity
 * @param {string} ip - The ESP32 Gateway IP (default 192.168.4.1)
 * @param {number} port - The WebSocket port (default 81)
 * @param {function} onDataReceived - Callback for parsed data { ch1, ch2, ch3, ch4 }
 */
export const useEsp32WebSocket = (ip = '192.168.4.1', port = 81, onDataReceived) => {
    const [status, setStatus] = useState('Disconnected');
    const [errorCount, setErrorCount] = useState(0);
    const wsRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const isEnabledRef = useRef(false);

    // Parse the specific "CH1:xxxx CH2:xxxx..." format
    const parseData = useCallback((line) => {
        try {
            const values = { ch1: 0, ch2: 0, ch3: 0, ch4: 0 };
            const matches = line.matchAll(/CH(\d):(\d+)/g);

            let found = false;
            for (const match of matches) {
                const ch = parseInt(match[1]);
                const val = parseInt(match[2]);
                if (ch >= 1 && ch <= 4) {
                    values[`ch${ch}`] = val;
                    found = true;
                }
            }

            if (found && onDataReceived) {
                onDataReceived(values);
            }
        } catch (e) {
            console.warn("WS Parsing error:", e, line);
        }
    }, [onDataReceived]);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const url = `ws://${ip}:${port}`;
        console.log(`[WS] Connecting to ${url}...`);
        setStatus('Connecting');

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[WS] Connected successfully');
            setStatus('Connected');
            setErrorCount(0);
        };

        ws.onmessage = (event) => {
            parseData(event.data.trim());
        };

        ws.onerror = (err) => {
            console.error('[WS] Connection error');
            setStatus('Error');
        };

        ws.onclose = () => {
            console.log('[WS] Connection closed');
            if (wsRef.current === ws) { // If it wasn't a deliberate disconnect
                wsRef.current = null;
                if (isEnabledRef.current) {
                    setStatus('Reconnecting in 3s...');
                    reconnectTimerRef.current = setTimeout(connect, 3000);
                } else {
                    setStatus('Disconnected');
                }
            }
        };
    }, [ip, port, parseData]);

    const disconnect = useCallback(() => {
        isEnabledRef.current = false;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

        if (wsRef.current) {
            const ws = wsRef.current;
            wsRef.current = null; // Prevent onclose from triggering reconnect

            // Only close if it's not already closing or closed
            if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
                console.log('[WS] Handshake/Connection closing...');
                ws.close();
            }
        }
        setStatus('Disconnected');
    }, []);

    const toggleConnection = useCallback(() => {
        if (wsRef.current || isEnabledRef.current) {
            disconnect();
        } else {
            isEnabledRef.current = true;
            connect();
        }
    }, [connect, disconnect]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isEnabledRef.current = false;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    return {
        status,
        isConnected: status === 'Connected',
        toggleConnection,
        disconnect,
        connect: () => {
            isEnabledRef.current = true;
            connect();
        }
    };
};

export default useEsp32WebSocket;
