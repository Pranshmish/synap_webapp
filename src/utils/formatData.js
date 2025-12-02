import { BUFFER_CONFIG } from '../config/api';

/**
 * Validate a single ADC value from ESP32
 * @param {number} value - ADC reading
 * @returns {boolean} - True if valid (0-4095)
 */
export const isValidADCValue = (value) => {
    return typeof value === 'number' &&
        !isNaN(value) &&
        value >= BUFFER_CONFIG.MIN_ADC_VALUE &&
        value <= BUFFER_CONFIG.MAX_ADC_VALUE;
};

/**
 * Validate a complete chunk of samples
 * @param {number[]} chunk - Array of ADC values
 * @returns {boolean} - True if exactly 200 valid samples
 */
export const isValidChunk = (chunk) => {
    return Array.isArray(chunk) &&
        chunk.length === BUFFER_CONFIG.CHUNK_SIZE &&
        chunk.every(isValidADCValue);
};

/**
 * Split buffer into 200-sample chunks
 * @param {Array<{time: number, amplitude: number}>} buffer - Record buffer with time/amplitude objects
 * @returns {number[][]} - Array of 200-sample chunks (amplitude values only)
 */
export const splitIntoChunks = (buffer) => {
    const chunkSize = BUFFER_CONFIG.CHUNK_SIZE;
    const chunks = [];

    for (let i = 0; i + chunkSize <= buffer.length; i += chunkSize) {
        const chunk = buffer.slice(i, i + chunkSize).map(d => d.amplitude);
        if (chunk.length === chunkSize) {
            chunks.push(chunk);
        }
    }

    return chunks;
};

/**
 * Get the last 200 samples from buffer for prediction
 * @param {Array<{time: number, amplitude: number}>} buffer - Record buffer
 * @returns {number[]} - Array of 200 amplitude values
 */
export const getLastChunk = (buffer) => {
    if (buffer.length < BUFFER_CONFIG.CHUNK_SIZE) {
        return null;
    }
    return buffer.slice(-BUFFER_CONFIG.CHUNK_SIZE).map(d => d.amplitude);
};

/**
 * Format samples_per_person response for display
 * @param {Object} samplesPerPerson - {Pranshul: 5, Aditi: 3, ...}
 * @returns {string} - Formatted string for UI
 */
export const formatSampleCounts = (samplesPerPerson) => {
    if (!samplesPerPerson) return 'No data';

    return Object.entries(samplesPerPerson)
        .map(([name, count]) => `${name}: ${count}`)
        .join(', ');
};

/**
 * Format prediction result for display
 * @param {Object} result - {prediction: string, confidence: number, probabilities: Object}
 * @returns {Object} - Formatted result with display strings
 */
export const formatPrediction = (result) => {
    if (!result) return null;

    return {
        person: result.prediction,
        confidence: (result.confidence * 100).toFixed(1),
        confidenceDisplay: `${(result.confidence * 100).toFixed(1)}%`,
        probabilities: result.probabilities,
        probabilitiesDisplay: Object.entries(result.probabilities || {})
            .sort((a, b) => b[1] - a[1])
            .map(([name, prob]) => `${name}: ${(prob * 100).toFixed(1)}%`)
            .join(', '),
    };
};

/**
 * Format training metrics for display
 * @param {Object} metrics - {accuracy: 1.0, precision: 1.0, ...}
 * @returns {string} - Formatted metrics string
 */
export const formatMetrics = (metrics) => {
    if (!metrics) return 'Training complete';

    const parts = [];
    if (metrics.accuracy !== undefined) {
        parts.push(`Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`);
    }
    if (metrics.precision !== undefined) {
        parts.push(`Precision: ${(metrics.precision * 100).toFixed(1)}%`);
    }
    if (metrics.recall !== undefined) {
        parts.push(`Recall: ${(metrics.recall * 100).toFixed(1)}%`);
    }
    if (metrics.f1_score !== undefined) {
        parts.push(`F1: ${(metrics.f1_score * 100).toFixed(1)}%`);
    }

    return parts.length > 0 ? parts.join(' | ') : 'Training complete';
};

/**
 * Determine if prediction is a match based on confidence threshold
 * @param {Object} result - Prediction result
 * @param {number} threshold - Confidence threshold (default 0.5)
 * @returns {boolean} - True if confident match
 */
export const isConfidentMatch = (result, threshold = 0.5) => {
    return result && result.confidence >= threshold;
};

/**
 * Check if prediction result indicates an intruder
 * @param {Object} result - Prediction result from backend
 * @returns {boolean} - True if intruder detected
 */
export const isIntruderDetected = (result) => {
    return result && result.is_intruder === true;
};

/**
 * Get alert level based on prediction result
 * @param {Object} result - Prediction result
 * @returns {'safe'|'warning'|'danger'} - Alert level
 */
export const getAlertLevel = (result) => {
    if (!result) return 'warning';
    if (result.is_intruder) return 'danger';
    if (result.confidence < 0.5) return 'warning';
    return 'safe';
};

export default {
    isValidADCValue,
    isValidChunk,
    splitIntoChunks,
    getLastChunk,
    formatSampleCounts,
    formatPrediction,
    formatMetrics,
    isConfidentMatch,
    isIntruderDetected,
    getAlertLevel,
};
