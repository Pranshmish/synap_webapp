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
    DATASET_LIST: '/dataset/list',
    DATASET_PREVIEW: '/dataset/preview',
    TRAIN: '/train',
    FEATURES: '/model/features',
    // MLP Endpoints
    TRAIN_MLP: '/train_mlp',
    PREDICT_MLP: '/predict_mlp',
    DATASET_STATUS: '/dataset_status',
    // Multi-Model Endpoints
    AVAILABLE_MODELS: '/available_models',
    TRAIN_SELECTED_MODEL: '/train_selected_model',
    PREDICT_SELECTED_MODEL: '/predict_selected_model',
    SET_ACTIVE_MODEL: '/set_active_model',
    MODEL_STATUS: '/model_status',
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
     * Save training data chunk to backend with optional analysis data
     * @param {number[]} rawTimeSeries - Array of ADC values
     * @param {string} label - Label (HOME_Name or INTRUDER_Name)
     * @param {Object} analysisData - Optional {fftData, lifData, filteredWaveform}
     * @returns {Promise<{success: boolean, samples_per_person: Object}>}
     */
    async saveTrainData(rawTimeSeries, label, analysisData = null) {
        const dataItem = { raw_time_series: rawTimeSeries };

        // Add optional analysis data if provided
        if (analysisData) {
            if (analysisData.fftData) {
                dataItem.fft_data = analysisData.fftData;
            }
            if (analysisData.lifData) {
                dataItem.lif_data = analysisData.lifData;
            }
            if (analysisData.filteredWaveform) {
                dataItem.filtered_waveform = analysisData.filteredWaveform;
            }
        }

        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.TRAIN_DATA}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: [dataItem],
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
     * Download an individual person's dataset as ZIP
     * @param {string} personName - Name of the person/dataset to download
     * @returns {Promise<Blob>}
     */
    async downloadIndividualDataset(personName) {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.DATASET_DOWNLOAD}/${encodeURIComponent(personName)}?t=${Date.now()}`, {
            method: 'GET',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `Download failed: ${response.status}`);
        }

        return response.blob();
    },

    /**
     * Get list of all available datasets with metadata
     * @returns {Promise<{datasets: Array<{name: string, sample_count: number, waveform_count: number, size_kb: number, last_modified: string}>, total_samples: number, total_datasets: number}>}
     */
    async getDatasetList() {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.DATASET_LIST}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch dataset list: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Get preview of a person's dataset including sample data and statistics
     * @param {string} personName - Name of the person/dataset to preview
     * @param {number} limit - Max number of samples to return (default 20)
     * @returns {Promise<{person: string, samples: Array, total_samples: number, waveform_count: number, feature_stats: Object}>}
     */
    async getDatasetPreview(personName, limit = 20) {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.DATASET_PREVIEW}/${encodeURIComponent(personName)}?limit=${limit}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `Preview failed: ${response.status}`);
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

    // ============== MULTI-MODEL API ==============

    /**
     * Get list of available models with status
     * @returns {Promise<{models: Array, active_model: string}>}
     */
    async getAvailableModels() {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.AVAILABLE_MODELS}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Train a specific model type
     * @param {string} modelName - "RandomForestEnsemble", "MLPClassifier", or "HybridLSTMSNN"
     * @param {string[]} selectedDatasets - Optional array of dataset names
     * @returns {Promise<{success: boolean, metrics: Object, model_name: string}>}
     */
    async trainSelectedModel(modelName, selectedDatasets = null) {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.TRAIN_SELECTED_MODEL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model_name: modelName,
                selected_datasets: selectedDatasets
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `Training failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Predict using a specific model
     * @param {number[]} data - Array of raw ADC values
     * @param {string} modelName - Model to use (optional, uses active model if not specified)
     * @returns {Promise<{prediction: string, confidence: number, is_intruder: boolean, model_used: string}>}
     */
    async predictWithModel(data, modelName = null) {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PREDICT_SELECTED_MODEL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: data,
                model_name: modelName
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `Prediction failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Set the active model for predictions
     * @param {string} modelName - Model to set as active
     * @returns {Promise<{success: boolean, active_model: string}>}
     */
    async setActiveModel(modelName) {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.SET_ACTIVE_MODEL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_name: modelName }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `Failed to set model: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Get comprehensive model status
     * @returns {Promise<{models: Object, active_model: string}>}
     */
    async getModelStatus() {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.MODEL_STATUS}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch model status: ${response.status}`);
        }

        return response.json();
    },

    // ============================================================================
    // SIGNAL & WAVELET VISUALIZATION API
    // ============================================================================

    /**
     * Get list of available visualization sources (datasets with waveform data)
     * @returns {Promise<{success: boolean, sources: Array<{name: string, waveform_count: number}>}>}
     */
    async getVisualizationSources() {
        const response = await fetch(`${API_BASE_URL}/api/visualization/sources`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch sources: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Get list of available samples for a source
     * @param {string} source - Dataset source (e.g., "HOME_Dixit")
     * @returns {Promise<{success: boolean, samples: Array<{filename: string, timestamp: string}>}>}
     */
    async getVisualizationSamples(source) {
        const response = await fetch(`${API_BASE_URL}/api/visualization/samples/${encodeURIComponent(source)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch samples: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Get signal visualization data (time series, FFT, wavelet scalogram)
     * @param {Object} params - Visualization parameters
     * @param {string} params.sample_id - Sample identifier (timestamp or filename)
     * @param {string} params.source - Dataset source (e.g., "HOME_Dixit")
     * @param {number} [params.max_points=2048] - Max time series points
     * @param {number} [params.fft_n_points=1024] - FFT size
     * @param {Object} [params.wavelet] - Wavelet config {type, family, num_scales}
     * @returns {Promise<{success: boolean, time_series: Object, fft: Object, wavelet: Object, sample_info: Object}>}
     */
    async getSignalVisualization(params) {
        const response = await fetch(`${API_BASE_URL}/api/visualization/signal_wavelet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sample_id: params.sample_id,
                source: params.source,
                max_points: params.max_points || 2048,
                fft_n_points: params.fft_n_points || 1024,
                wavelet: params.wavelet || { type: 'cwt', family: 'morl', num_scales: 32 }
            }),
        });

        if (!response.ok) {
            throw new Error(`Visualization failed: ${response.status}`);
        }

        return response.json();
    },
};

export default api;
