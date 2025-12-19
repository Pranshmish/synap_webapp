/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎙️ VOICE AUTHENTICATION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Integrates with AI Voice Detection API for:
 * - Challenge-Response Authentication (anti-replay)
 * - Simple Voice Authentication
 * - Real-time WebSocket Voice Streaming
 * - Session Management
 * 
 * API Base: https://ai-voice-detection-9lne.onrender.com
 */

import { Mp3Encoder } from '@breezystack/lamejs';

// Use local API for development, remote for production
// Use local API for development, remote for production
const USE_LOCAL_API = true; // Using local API for development

const API_BASE = USE_LOCAL_API
    ? "http://localhost:8000"
    : "https://ai-voice-detection-3.onrender.com";
const WS_BASE = USE_LOCAL_API
    ? "ws://localhost:8000"
    : "wss://ai-voice-detection-3.onrender.com";

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert audio blob to proper format for API
 */
const prepareAudioBlob = (blob) => {
    // Ensure proper MIME type
    const mimeType = blob.type || 'audio/mp3';
    return new Blob([blob], { type: mimeType });
};

/**
 * Convert Float32Array to MP3 using lamejs
 * @param {Float32Array} samples - Audio samples [-1, 1]
 * @param {number} sampleRate - Sample rate (e.g., 16000)
 * @returns {Blob} MP3 blob
 */
const float32ToMp3 = (samples, sampleRate = 16000) => {
    // Convert Float32 to Int16
    const int16Samples = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Create MP3 encoder (mono, sample rate, 128kbps)
    const mp3encoder = new Mp3Encoder(1, sampleRate, 128);

    const mp3Data = [];
    const blockSize = 1152; // Must be a multiple of 576

    for (let i = 0; i < int16Samples.length; i += blockSize) {
        const chunk = int16Samples.subarray(i, i + blockSize);
        const mp3buf = mp3encoder.encodeBuffer(chunk);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }

    // Flush remaining data
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }

    // Combine all chunks
    const totalLength = mp3Data.reduce((acc, buf) => acc + buf.length, 0);
    const mp3Array = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of mp3Data) {
        mp3Array.set(buf, offset);
        offset += buf.length;
    }

    return new Blob([mp3Array], { type: 'audio/mp3' });
};

/**
 * Convert Float32Array to WAV Blob (strictly PCM WAV for soundfile compatibility)
 * @param {Float32Array} samples - The audio samples
 * @param {number} sampleRate - Sample rate (e.g., 16000)
 * @returns {Blob} WAV blob
 */
const float32ToWav = (samples, sampleRate = 16000) => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // Helper to write string
    const writeString = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);  // File size - 8
    writeString(8, 'WAVE');

    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);              // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);               // AudioFormat (1 = PCM)
    view.setUint16(22, numChannels, true);     // NumChannels
    view.setUint32(24, sampleRate, true);      // SampleRate
    view.setUint32(28, byteRate, true);        // ByteRate
    view.setUint16(32, blockAlign, true);      // BlockAlign
    view.setUint16(34, bitsPerSample, true);   // BitsPerSample

    // data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);        // Subchunk2Size

    // Write PCM samples (convert float32 to int16)
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        // Clamp to [-1, 1]
        let sample = samples[i];
        if (sample > 1) sample = 1;
        if (sample < -1) sample = -1;
        // Convert to int16 range [-32768, 32767]
        const int16 = Math.round(sample * 32767);
        view.setInt16(offset, int16, true);
        offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
};

/**
 * Resample audio data to target sample rate
 * @param {Float32Array} samples - Original samples
 * @param {number} fromRate - Original sample rate
 * @param {number} toRate - Target sample rate (16000 for API)
 * @returns {Float32Array} Resampled audio
 */
const resampleAudio = (samples, fromRate, toRate) => {
    if (fromRate === toRate) return samples;

    const ratio = fromRate / toRate;
    const newLength = Math.floor(samples.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
        const t = srcIndex - srcIndexFloor;

        // Linear interpolation
        result[i] = samples[srcIndexFloor] * (1 - t) + samples[srcIndexCeil] * t;
    }

    return result;
};

/**
 * Record audio from microphone and convert to WAV
 * Uses AudioContext for reliable cross-browser WAV generation
 * @param {number} durationMs - Duration in milliseconds
 * @returns {Promise<Blob>} WAV Audio blob
 */
export const recordAudio = (durationMs = 3000) => {
    return new Promise(async (resolve, reject) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                }
            });

            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const sampleRate = audioContext.sampleRate;
            const source = audioContext.createMediaStreamSource(stream);

            // Use ScriptProcessor (deprecated but reliable for WAV)
            const bufferSize = 4096;
            const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
            const audioChunks = [];

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                audioChunks.push(new Float32Array(inputData));
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            setTimeout(() => {
                processor.disconnect();
                source.disconnect();
                stream.getTracks().forEach(track => track.stop());

                // Combine all chunks
                const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
                const samples = new Float32Array(totalLength);
                let offset = 0;
                for (const chunk of audioChunks) {
                    samples.set(chunk, offset);
                    offset += chunk.length;
                }

                console.log(`🎤 Recorded ${samples.length} samples at ${sampleRate}Hz`);

                // Resample to 16kHz using OfflineAudioContext
                const TARGET_RATE = 16000;
                const duration = samples.length / sampleRate;
                const offlineCtx = new OfflineAudioContext(1, Math.ceil(duration * TARGET_RATE), TARGET_RATE);

                const audioBuffer = offlineCtx.createBuffer(1, samples.length, sampleRate);
                audioBuffer.getChannelData(0).set(samples);

                const bufferSource = offlineCtx.createBufferSource();
                bufferSource.buffer = audioBuffer;
                bufferSource.connect(offlineCtx.destination);
                bufferSource.start();

                offlineCtx.startRendering().then(renderedBuffer => {
                    const resampledSamples = renderedBuffer.getChannelData(0);
                    console.log(`🎤 Resampled to ${resampledSamples.length} samples at ${TARGET_RATE}Hz`);
                    const wavBlob = float32ToWav(resampledSamples, TARGET_RATE);
                    console.log(`🎤 WAV blob: ${wavBlob.size} bytes`);
                    audioContext.close();
                    resolve(wavBlob);
                }).catch(err => {
                    audioContext.close();
                    reject(new Error('Resampling failed: ' + err.message));
                });
            }, durationMs);

        } catch (error) {
            reject(new Error('Microphone access denied: ' + error.message));
        }
    });
};


// ═══════════════════════════════════════════════════════════════════════════════
// 🏥 HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if the Voice Auth API is ready
 * @returns {Promise<{ready: boolean, status: string, modelLoaded: boolean}>}
 */
export const checkAPIHealth = async () => {
    try {
        const response = await fetch(`${API_BASE}/api/v1/voice/health`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`API Health check failed: ${response.status}`);
        }

        const data = await response.json();
        return {
            ready: data.status === 'ready_for_demo',
            status: data.status,
            modelLoaded: data.model_loaded,
            version: data.version,
            sttAvailable: data.stt_available !== false
        };
    } catch (error) {
        console.error('Voice Auth API health check failed:', error);
        return {
            ready: false,
            status: 'error',
            modelLoaded: false,
            error: error.message
        };
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🎤 BACKEND STT (Whisper)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transcribe audio using backend Whisper STT
 * @param {Blob} audioBlob - Audio to transcribe
 * @returns {Promise<{success: boolean, text: string, message?: string}>}
 */
export const transcribeAudio = async (audioBlob) => {
    try {
        console.log('🎤 Backend STT: Sending', audioBlob.size, 'bytes');

        const formData = new FormData();
        formData.append('audio', prepareAudioBlob(audioBlob), 'recording.wav');

        const response = await fetch(`${API_BASE}/api/v1/stt/transcribe`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        console.log('🎤 Backend STT raw response:', data);

        if (!response.ok) {
            return {
                success: false,
                text: '',
                message: data.detail || data.message || `HTTP ${response.status}`
            };
        }

        // Parse backend response - it returns {success, text, message}
        const text = (data.text || '').trim();
        const success = data.success === true && text.length > 0;

        return {
            success: success,
            text: text,
            message: data.message || (success ? 'OK' : 'No speech detected')
        };
    } catch (error) {
        console.error('🎤 Backend STT error:', error);
        return {
            success: false,
            text: '',
            message: error.message || 'Network error'
        };
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 📝 USER ENROLLMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enroll a user with voice samples
 * @param {string} userId - Unique user identifier
 * @param {File[]|Blob[]} audioFiles - Array of audio files (3+ recommended)
 * @param {boolean} overwrite - Overwrite existing enrollment
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const enrollUser = async (userId, audioFiles, overwrite = true) => {
    try {
        console.log('📤 Enrolling user:', userId, 'with', audioFiles.length, 'samples');

        const formData = new FormData();
        formData.append('user_id', userId);
        formData.append('overwrite', overwrite.toString());

        audioFiles.forEach((file, index) => {
            const blob = prepareAudioBlob(file);
            // Use correct extension based on type
            let ext = 'wav';
            if (blob.type.includes('mp3') || blob.type.includes('mpeg')) ext = 'mp3';
            else if (blob.type.includes('ogg')) ext = 'ogg';
            else if (blob.type.includes('webm')) ext = 'webm';
            console.log(`📎 Sample ${index}:`, blob.size, 'bytes, type:', blob.type, '→', `sample_${index}.${ext}`);
            formData.append('audio_files', blob, `sample_${index}.${ext}`);
        });

        // Add timeout for slow uploads (60 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(`${API_BASE}/api/v1/voice/enroll`, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await response.json();
        console.log('📥 Enroll response:', response.status, JSON.stringify(data, null, 2));

        if (!response.ok) {
            // FastAPI returns validation errors as array in detail
            let errorMsg = 'Enrollment failed';
            if (data.detail) {
                if (Array.isArray(data.detail)) {
                    errorMsg = data.detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
                } else if (typeof data.detail === 'string') {
                    errorMsg = data.detail;
                } else {
                    errorMsg = JSON.stringify(data.detail);
                }
            } else if (data.message) {
                errorMsg = data.message;
            }
            throw new Error(errorMsg);
        }

        // Check if API reports success AND message doesn't indicate failure
        const apiSuccess = data.success !== false;
        const hasValidSamples = !data.message?.includes('0 valid samples');

        if (!apiSuccess || !hasValidSamples) {
            return {
                success: false,
                userId: data.user_id,
                message: data.message || 'Enrollment failed - no valid voice samples detected'
            };
        }

        return {
            success: true,
            userId: data.user_id,
            message: data.message || 'User enrolled successfully'
        };
    } catch (error) {
        console.error('Voice enrollment failed:', error);
        return {
            success: false,
            message: error.message || 'Unknown enrollment error'
        };
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 SIMPLE AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple voice authentication (no challenge)
 * @param {string} userId - User to authenticate as
 * @param {Blob} audioBlob - Audio recording
 * @param {string} sessionId - Optional session ID
 * @returns {Promise<{authenticated: boolean, confidence: number, decision: string}>}
 */
export const authenticateVoice = async (userId, audioBlob, sessionId = null) => {
    try {
        console.log(`🔊 Authenticating voice for user: ${userId}`);
        console.log(`🔊 Audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

        const formData = new FormData();
        formData.append('user_id', userId);

        // Prepare audio - ensure it's WAV format
        const preparedBlob = prepareAudioBlob(audioBlob);
        console.log(`🔊 Prepared blob: ${preparedBlob.size} bytes, type: ${preparedBlob.type}`);

        formData.append('audio', preparedBlob, 'recording.wav');

        if (sessionId) {
            formData.append('session_id', sessionId);
        }

        console.log(`🔊 Sending to: ${API_BASE}/api/v1/voice/authenticate`);

        const response = await fetch(`${API_BASE}/api/v1/voice/authenticate`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        console.log(`🔊 Response status: ${response.status}`);
        console.log(`🔊 Response data: ${JSON.stringify(data)}`);

        if (!response.ok) {
            throw new Error(data.detail || data.message || 'Authentication failed');
        }

        return {
            authenticated: data.authenticated,
            confidence: data.confidence_score,
            decision: data.decision,
            message: data.message
        };
    } catch (error) {
        console.error('🔊 Voice authentication failed:', error);
        return {
            authenticated: false,
            confidence: 0,
            decision: 'ERROR',
            message: error.message
        };
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 CHALLENGE-RESPONSE AUTHENTICATION (RECOMMENDED)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Start a challenge-response authentication session
 * @param {string} userId - User to authenticate
 * @returns {Promise<{sessionId: string, phrase: string, trialsRemaining: number, expiresIn: number}>}
 */
export const startChallenge = async (userId) => {
    try {
        const formData = new FormData();
        formData.append('user_id', userId);

        const response = await fetch(`${API_BASE}/api/v1/challenge/start`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || data.message || 'Failed to start challenge');
        }

        return {
            success: true,
            sessionId: data.session_id,
            phrase: data.phrase,
            trialsRemaining: data.trials_remaining,
            expiresIn: data.expires_in_seconds,
            sttAvailable: data.stt_available
        };
    } catch (error) {
        console.error('Failed to start challenge:', error);
        return {
            success: false,
            message: error.message
        };
    }
};

/**
 * Verify challenge-response with voice + phrase
 * @param {string} sessionId - Session from startChallenge
 * @param {Blob} audioBlob - Audio of user speaking the phrase
 * @returns {Promise<{success: boolean, speakerMatch: boolean, phraseMatch: boolean, scores: object}>}
 */
export const verifyChallenge = async (sessionId, audioBlob) => {
    try {
        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('audio', prepareAudioBlob(audioBlob), 'challenge.wav');

        const response = await fetch(`${API_BASE}/api/v1/challenge/verify`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || data.message || 'Verification failed');
        }

        return {
            success: data.success,
            speakerMatch: data.speaker_match,
            phraseMatch: data.phrase_match,
            spokenText: data.spoken_text,
            expectedPhrase: data.expected_phrase,
            speakerScore: data.speaker_score,
            phraseScore: data.phrase_score,
            trialsRemaining: data.trials_remaining,
            message: data.message
        };
    } catch (error) {
        console.error('Challenge verification failed:', error);
        return {
            success: false,
            speakerMatch: false,
            phraseMatch: false,
            message: error.message
        };
    }
};

/**
 * Verify challenge-response with voice + phrase from BROWSER STT
 * Uses browser's Web Speech API for text recognition (more accurate than Whisper)
 * @param {string} sessionId - Session from startChallenge
 * @param {Blob} audioBlob - Audio of user speaking the phrase
 * @param {string} spokenText - Text from browser's SpeechRecognition
 * @returns {Promise<{success: boolean, speakerMatch: boolean, phraseMatch: boolean, scores: object}>}
 */
export const verifyChallengeWithText = async (sessionId, audioBlob, spokenText) => {
    try {
        console.log('🎤 Verifying with browser STT:', spokenText);

        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('spoken_text', spokenText);
        formData.append('audio', prepareAudioBlob(audioBlob), 'challenge.wav');

        const response = await fetch(`${API_BASE}/api/v1/challenge/verify-with-text`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || data.message || 'Verification failed');
        }

        return {
            success: data.success,
            speakerMatch: data.speaker_match,
            phraseMatch: data.phrase_match,
            spokenText: data.spoken_text,
            expectedPhrase: data.expected_phrase,
            speakerScore: data.speaker_score,
            phraseScore: data.phrase_score,
            trialsRemaining: data.trials_remaining,
            message: data.message
        };
    } catch (error) {
        console.error('Challenge verification failed:', error);
        return {
            success: false,
            speakerMatch: false,
            phraseMatch: false,
            message: error.message
        };
    }
};

/**
 * Complete challenge-response flow
 * @param {string} userId - User to authenticate
 * @param {number} recordDurationMs - How long to record (default 4 seconds)
 * @param {function} onPhraseReady - Callback when phrase is ready to display
 * @param {function} onRecording - Callback when recording starts
 * @returns {Promise<{authenticated: boolean, score: number, message: string}>}
 */
export const performChallengeAuth = async (userId, recordDurationMs = 4000, onPhraseReady = null, onRecording = null) => {
    try {
        // Step 1: Start challenge
        const challenge = await startChallenge(userId);

        if (!challenge.success) {
            return { authenticated: false, message: challenge.message };
        }

        // Step 2: Notify about phrase
        if (onPhraseReady) {
            onPhraseReady(challenge.phrase);
        }

        // Brief delay to let user read the phrase
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Step 3: Record user speaking
        if (onRecording) {
            onRecording(true);
        }

        const audioBlob = await recordAudio(recordDurationMs);

        if (onRecording) {
            onRecording(false);
        }

        // Step 4: Verify
        const result = await verifyChallenge(challenge.sessionId, audioBlob);

        if (result.success) {
            return {
                authenticated: true,
                score: result.speakerScore,
                phraseScore: result.phraseScore,
                spokenText: result.spokenText,
                message: result.message
            };
        } else {
            return {
                authenticated: false,
                trialsRemaining: result.trialsRemaining,
                message: result.message,
                spokenText: result.spokenText
            };
        }
    } catch (error) {
        console.error('Challenge auth failed:', error);
        return {
            authenticated: false,
            message: error.message
        };
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 📡 WEBSOCKET REAL-TIME STREAMING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a WebSocket connection for real-time voice streaming
 * @param {string} userId - User ID to authenticate
 * @param {function} onResult - Callback for authentication results
 * @param {function} onStatus - Callback for status updates
 * @param {function} onError - Callback for errors
 * @returns {object} Controller with start, stop, and connection
 */
export const createVoiceStream = (userId, onResult, onStatus, onError) => {
    let ws = null;
    let audioContext = null;
    let mediaStream = null;
    let processor = null;
    let isStreaming = false;

    const connect = () => {
        return new Promise((resolve, reject) => {
            try {
                ws = new WebSocket(`${WS_BASE}/ws/voice-stream`);

                ws.onopen = () => {
                    console.log('🔌 Voice stream WebSocket connected');
                    // Send user identification
                    ws.send(JSON.stringify({ user_id: userId }));
                    if (onStatus) onStatus('connected');
                    resolve(ws);
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);

                        if (data.type === 'status') {
                            if (onStatus) onStatus(data.status);
                        } else if (data.type === 'result') {
                            if (onResult) {
                                onResult({
                                    authorized: data.authorized,
                                    score: data.score,
                                    decision: data.decision,
                                    text: data.text,
                                    latencyMs: data.latency_ms
                                });
                            }
                        } else if (data.type === 'error') {
                            if (onError) onError(data.message);
                        }
                    } catch (e) {
                        console.error('Failed to parse WebSocket message:', e);
                    }
                };

                ws.onerror = (event) => {
                    console.error('WebSocket error:', event);
                    if (onError) onError('WebSocket connection error');
                    reject(new Error('WebSocket connection failed'));
                };

                ws.onclose = (event) => {
                    console.log('🔌 Voice stream WebSocket closed:', event.code);
                    if (onStatus) onStatus('disconnected');
                    isStreaming = false;
                };

            } catch (error) {
                reject(error);
            }
        });
    };

    const startStreaming = async () => {
        if (isStreaming) return;

        try {
            // Get microphone access with optimized settings
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Create audio context for processing (force 16kHz)
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContextClass({ sampleRate: 16000 });
            console.log("🎤 AudioContext Sample Rate:", audioContext.sampleRate); // DEBUG

            // Create nodes
            const source = audioContext.createMediaStreamSource(mediaStream);
            const gainNode = audioContext.createGain();
            processor = audioContext.createScriptProcessor(2048, 1, 1);

            // Configure Gain
            gainNode.gain.value = 2.5; // Boost volume by 2.5x

            // Connect: Source -> Gain -> Processor -> Destination
            source.connect(gainNode);
            gainNode.connect(processor);
            processor.connect(audioContext.destination);

            // Setup processing
            processor.onaudioprocess = (e) => {
                if (ws && ws.readyState === WebSocket.OPEN && isStreaming) {
                    const samples = e.inputBuffer.getChannelData(0);
                    // Send raw audio samples as Float32Array buffer
                    ws.send(new Float32Array(samples).buffer);
                }
            };

            isStreaming = true;
            if (onStatus) onStatus('streaming');

        } catch (error) {
            console.error('Failed to start audio streaming:', error);
            if (onError) onError('Microphone access failed');
        }
    };

    const stopStreaming = () => {
        isStreaming = false;

        if (processor) {
            processor.disconnect();
            processor = null;
        }

        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }

        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }

        if (onStatus) onStatus('stopped');
    };

    const disconnect = () => {
        stopStreaming();

        if (ws) {
            ws.close();
            ws = null;
        }
    };

    const start = async () => {
        await connect();
        await startStreaming();
    };

    const stop = () => {
        disconnect();
    };

    return {
        start,
        stop,
        connect,
        startStreaming,
        stopStreaming,
        disconnect,
        get isConnected() { return ws && ws.readyState === WebSocket.OPEN; },
        get isStreaming() { return isStreaming; }
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🎭 SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Voice Auth Session Manager
 * Manages authentication state and session persistence
 */
export class VoiceAuthSession {
    constructor(userId) {
        this.userId = userId;
        this.isAuthenticated = false;
        this.lastAuthTime = null;
        this.authScore = 0;
        this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
        this.challengeSession = null;
    }

    /**
     * Check if session is still valid
     */
    isValid() {
        if (!this.isAuthenticated || !this.lastAuthTime) return false;
        return (Date.now() - this.lastAuthTime) < this.sessionTimeout;
    }

    /**
     * Set authenticated state
     */
    setAuthenticated(score = 0) {
        this.isAuthenticated = true;
        this.lastAuthTime = Date.now();
        this.authScore = score;
    }

    /**
     * Clear authentication
     */
    clear() {
        this.isAuthenticated = false;
        this.lastAuthTime = null;
        this.authScore = 0;
        this.challengeSession = null;
    }

    /**
     * Get remaining session time in milliseconds
     */
    getRemainingTime() {
        if (!this.isValid()) return 0;
        return this.sessionTimeout - (Date.now() - this.lastAuthTime);
    }

    /**
     * Store challenge session data
     */
    setChallenge(sessionId, phrase) {
        this.challengeSession = { sessionId, phrase, startTime: Date.now() };
    }

    /**
     * Get current challenge
     */
    getChallenge() {
        return this.challengeSession;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
    checkAPIHealth,
    enrollUser,
    authenticateVoice,
    startChallenge,
    verifyChallenge,
    verifyChallengeWithText,
    performChallengeAuth,
    createVoiceStream,
    recordAudio,
    VoiceAuthSession,
    API_BASE,
    WS_BASE
};
