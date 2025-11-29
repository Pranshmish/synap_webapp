// Backend API Configuration
// In development, use empty string (requests go through Vite proxy)
// In production, use the full backend URL
export const API_BASE_URL = import.meta.env.PROD ? 'http://127.0.0.1:8000' : '';

// API Endpoints
export const ENDPOINTS = {
    TRAIN_DATA: '/train_data',
    PREDICT: '/predictfootsteps',
    STATUS: '/status',
    RESET_MODEL: '/reset_model',
    DATASET: '/dataset',
};

// Available persons for training/prediction
export const PERSONS = ['Pranshul', 'Aditi', 'Apurv', 'Samir'];

// Serial/Buffer Configuration
export const BUFFER_CONFIG = {
    CHUNK_SIZE: 200,           // Samples per chunk (200Hz = 1 second)
    MAX_ADC_VALUE: 4095,       // ESP32 ADC max value
    MIN_ADC_VALUE: 0,          // ESP32 ADC min value
    BUFFER_TIMEOUT_MS: 2000,   // Clear buffer after 2 sec of no data
    BAUD_RATE: 115200,         // Serial baud rate
};

// API Helper Functions
export const api = {
    /**
     * Save training data chunk to backend
     * @param {number[]} rawTimeSeries - Array of 200 ADC values
     * @param {string} label - Person name (Pranshul, Aditi, Apurv, Samir)
     * @returns {Promise<{success: boolean, samples_per_person: Object}>}
     */
    async saveTrainData(rawTimeSeries, label) {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.TRAIN_DATA}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: [{ raw_time_series: rawTimeSeries }],
                label: label,
                train_model: false,
            }),
        });

        if (!response.ok) {
            throw new Error(`Save failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Save multiple training data chunks at once
     * @param {number[][]} chunks - Array of 200-sample arrays
     * @param {string} label - Person name
     * @returns {Promise<{success: boolean, samples_per_person: Object}>}
     */
    async saveMultipleChunks(chunks, label) {
        const data = chunks.map(chunk => ({ raw_time_series: chunk }));

        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.TRAIN_DATA}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: data,
                label: label,
                train_model: false,
            }),
        });

        if (!response.ok) {
            throw new Error(`Save failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Train the model with existing data
     * @param {string} label - Current person label (required by API)
     * @returns {Promise<{success: boolean, metrics: Object}>}
     */
    async trainModel(label = 'Pranshul') {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.TRAIN_DATA}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: [],
                label: label,
                train_model: true,
            }),
        });

        if (!response.ok) {
            throw new Error(`Training failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Predict person from footstep vibration data
     * @param {number[]} data - Array of 200 ADC values (DIRECTLY, no wrapper)
     * @returns {Promise<{prediction: string, confidence: number, probabilities: Object}>}
     */
    async predict(data) {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PREDICT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: data,  // Direct array, NOT wrapped in raw_time_series
            }),
        });

        if (!response.ok) {
            throw new Error(`Prediction failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Get current status (sample counts, model status)
     * @returns {Promise<{samples: Object, model_trained: boolean, total_samples: number}>}
     */
    async getStatus() {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.STATUS}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Status fetch failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Reset model and delete all training data
     * @returns {Promise<{success: boolean, reset_time: string, deleted: {samples: number, model: boolean}}>}
     */
    async resetModel() {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.RESET_MODEL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Reset failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Get dataset information (all persons and their sample counts)
     * @returns {Promise<{persons: Array<{name: string, samples: number}>, total_samples: number, model_status: string}>}
     */
    async getDataset() {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.DATASET}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Dataset fetch failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Delete all data for a specific person
     * @param {string} personName - Name of the person to delete
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async deletePerson(personName) {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.DATASET}/${encodeURIComponent(personName)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Delete failed: ${response.status}`);
        }

        return response.json();
    },
};

export default api;
