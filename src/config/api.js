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
    DATASET_DOWNLOAD: '/dataset/download',
    DATASET_UPLOAD: '/dataset/upload',
    TRAIN: '/train',
    FEATURES: '/model/features',
    // NEW MLP Endpoints
    TRAIN_MLP: '/train_mlp',
    PREDICT_MLP: '/predict_mlp',
    DATASET_STATUS: '/dataset_status',
};

// HOME/INTRUDER Classification labels
// HOME samples are used for training, INTRUDER detected by MLP rules
export const LABELS = {
    HOME: 'HOME',
    INTRUDER: 'INTRUDER'
};

// Model type - Simple MLP (150 samples → 92% accuracy)
export const MODEL_CONFIG = {
    type: 'Simple MLP Classifier',
    trainingLabel: 'HOME',
    targetSamples: 150,
    targetAccuracy: 92,
    description: 'Dual dataset saving with MLP model and prediction rules.'
};

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
     * Save training data chunk to backend (HOME samples only for training)
     * @param {number[]} rawTimeSeries - Array of 200 ADC values
     * @param {string} label - Label (HOME for training)
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
     * @param {string} label - Current mode label (HOME or INTRUDER)
     * @returns {Promise<{success: boolean, metrics: Object}>}
     */
    async trainModel(label = 'HOME') {
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
     * Explicitly train the binary classifier
     * @returns {Promise<{success: boolean, metrics: Object}>}
     */
    async trainBinaryClassifier() {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.TRAIN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `Training failed: ${response.status}`);
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
     * Delete all data for a specific person/class
     * @param {string} className - Name of the class to delete (HOME or INTRUDER)
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async deletePerson(className) {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.DATASET}/${encodeURIComponent(className)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Delete failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Download the complete dataset as ZIP
     * @returns {Promise<Blob>}
     */
    async downloadDataset() {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.DATASET_DOWNLOAD}`, {
            method: 'GET',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `Download failed: ${response.status}`);
        }

        return response.blob();
    },

    /**
     * Upload a dataset ZIP file
     * @param {File} file - ZIP file to upload
     * @returns {Promise<{success: boolean, imported_samples: number, samples_per_person: Object}>}
     */
    async uploadDataset(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.DATASET_UPLOAD}`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `Upload failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Get feature names used by the model
     * @returns {Promise<{feature_count: number, features: string[], categories: Object}>}
     */
    async getFeatureNames() {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.FEATURES}`, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch features: ${response.status}`);
        }

        return response.json();
    },

    // ============== NEW MLP METHODS ==============

    /**
     * Train Simple MLP model
     * Uses dual dataset (HOME.csv), generates synthetic INTRUDER samples
     * @param {string[]} selectedDatasets - Optional array of dataset names to train on
     * @returns {Promise<{success: boolean, metrics: Object, dual_dataset: Object}>}
     */
    async trainMLP(selectedDatasets = null) {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.TRAIN_MLP}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                selected_datasets: selectedDatasets
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `MLP training failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Predict using MLP with prediction rules
     * @param {number[]} data - Array of raw ADC values
     * @returns {Promise<{prediction: string, confidence: number, is_intruder: boolean, ...}>}
     */
    async predictMLP(data) {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PREDICT_MLP}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: data }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `MLP prediction failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Get detailed dual dataset status
     * @returns {Promise<{dual_dataset: Object, sample_counts: Object, mlp_model: Object, ...}>}
     */
    async getDatasetStatus() {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.DATASET_STATUS}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Dataset status fetch failed: ${response.status}`);
        }

        return response.json();
    },
};

export default api;
