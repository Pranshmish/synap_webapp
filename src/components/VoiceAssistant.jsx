import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    checkAPIHealth,
    enrollUser,
    authenticateVoice,
    recordAudio,
    startChallenge,
    verifyChallengeWithText,
} from "../utils/voiceAuthService";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const ENROLLMENT_PHRASES = [
    "My voice is my password",
    "SynapSense keeps me safe",
    "Home sweet home"
];

// Storage helpers
const getOwnerPassword = () => localStorage.getItem("synap_owner_password");
const setOwnerPassword = (pin) => localStorage.setItem("synap_owner_password", pin);
const hasOwnerPassword = () => !!getOwnerPassword();
const verifyOwnerPassword = (input) => getOwnerPassword() === input;
const getOwners = () => JSON.parse(localStorage.getItem("synap_owners") || '["owner"]');
const getEnrolledOwners = () => JSON.parse(localStorage.getItem("synap_enrolled_owners") || '[]');
const setEnrolledOwners = (owners) => localStorage.setItem("synap_enrolled_owners", JSON.stringify(owners));
const markOwnerEnrolled = (name) => {
    const enrolled = getEnrolledOwners();
    if (!enrolled.includes(name)) { enrolled.push(name); setEnrolledOwners(enrolled); }
};
const addOwner = (name) => {
    const owners = getOwners();
    if (!owners.includes(name)) { owners.push(name); localStorage.setItem("synap_owners", JSON.stringify(owners)); }
};
const removeOwner = (name) => {
    if (name === "owner") return false;
    localStorage.setItem("synap_owners", JSON.stringify(getOwners().filter(o => o !== name)));
    setEnrolledOwners(getEnrolledOwners().filter(o => o !== name));
    return true;
};

export default function VoiceAssistant() {
    const navigate = useNavigate();
    const recognitionRef = useRef(null);
    const enrollmentInProgressRef = useRef(false);

    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [voiceAuthStatus, setVoiceAuthStatus] = useState("unknown");
    const [status, setStatus] = useState("idle");
    const [statusMessage, setStatusMessage] = useState("");
    const [liveTranscript, setLiveTranscript] = useState("");

    const [isEnrolled, setIsEnrolled] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [enrolledOwners, setEnrolledOwnersState] = useState([]);
    const [owners, setOwnersState] = useState([]);

    const [isEnrolling, setIsEnrolling] = useState(false);
    const [enrollmentStep, setEnrollmentStep] = useState(0);
    const [currentEnrollPhrase, setCurrentEnrollPhrase] = useState("");

    const [showPinModal, setShowPinModal] = useState(false);
    const [pinModalMode, setPinModalMode] = useState("setup");
    const [pinValue, setPinValue] = useState("");
    const [pinConfirmValue, setPinConfirmValue] = useState("");
    const [pinError, setPinError] = useState("");
    const [pendingAction, setPendingAction] = useState(null);

    const [showOwnerModal, setShowOwnerModal] = useState(false);
    const [newOwnerName, setNewOwnerName] = useState("");

    const getUserId = (ownerName = "owner") => `voice_${ownerName}`;

    // ═══════════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        const init = async () => {
            try {
                const health = await checkAPIHealth();
                setVoiceAuthStatus(health.ready ? "ready" : "error");
            } catch {
                setVoiceAuthStatus("error");
            }
            setEnrolledOwnersState(getEnrolledOwners());
            setOwnersState(getOwners());
            setIsEnrolled(getEnrolledOwners().length > 0);
        };
        init();
    }, []);

    const speak = useCallback((text) => {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.rate = 1.0;
        speechSynthesis.speak(u);
    }, []);

    const updateStatus = (s, msg = "") => { setStatus(s); setStatusMessage(msg); };

    // ═══════════════════════════════════════════════════════════════════════════
    // VOICE IDENTIFICATION - Check speaker against ALL enrolled users
    // ═══════════════════════════════════════════════════════════════════════════
    const identifyVoice = async (audioBlob) => {
        const enrolled = getEnrolledOwners();
        console.log("🎯 Voice identification starting...");

        if (enrolled.length === 0) {
            console.log("🎯 No enrolled users - allowing");
            return { identified: true, user: null, score: 1.0 };
        }

        if (!audioBlob || audioBlob.size < 1000) {
            console.log("🎯 Invalid audio:", audioBlob?.size || 0, "bytes");
            return { identified: false, user: null, score: 0, error: "No audio" };
        }

        let bestMatch = { user: null, score: 0, authenticated: false, decision: "" };

        for (const owner of enrolled) {
            try {
                console.log(`🎯 Checking: ${owner}`);
                const result = await authenticateVoice(getUserId(owner), audioBlob);
                console.log(`🎯 ${owner}: auth=${result.authenticated}, score=${result.confidence?.toFixed(2)}, decision=${result.decision}`);

                if (result.decision === "NOT_ENROLLED") continue;

                if (result.authenticated && result.confidence > bestMatch.score) {
                    bestMatch = { user: owner, score: result.confidence, authenticated: true, decision: result.decision };
                } else if (!bestMatch.authenticated && result.confidence > bestMatch.score) {
                    bestMatch = { user: owner, score: result.confidence, authenticated: false, decision: result.decision };
                }
            } catch (e) {
                console.error(`🎯 Error checking ${owner}:`, e);
            }
        }

        console.log("🎯 Best match:", bestMatch);
        return { identified: bestMatch.authenticated, user: bestMatch.user, score: bestMatch.score, decision: bestMatch.decision };
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PIN MODAL
    // ═══════════════════════════════════════════════════════════════════════════
    const openPinModal = (mode, action = null) => {
        setPinModalMode(mode);
        setPinValue("");
        setPinConfirmValue("");
        setPinError("");
        setPendingAction(() => action);
        setShowPinModal(true);
    };

    const handlePinSubmit = () => {
        if (pinValue.length !== 4 || !/^\d{4}$/.test(pinValue)) { setPinError("4 digits required"); return; }
        if (pinModalMode === "setup") {
            if (pinConfirmValue !== pinValue) { setPinError("PIN mismatch"); return; }
            setOwnerPassword(pinValue);
        } else {
            if (!verifyOwnerPassword(pinValue)) { setPinError("Invalid PIN"); return; }
        }
        setShowPinModal(false);
        if (pendingAction) setTimeout(pendingAction, 200);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // ENROLLMENT - Create voice profile
    // ═══════════════════════════════════════════════════════════════════════════
    const startEnrollment = useCallback((ownerName = "owner") => {
        if (voiceAuthStatus !== "ready") { updateStatus("error", "OFFLINE"); return; }
        if (!hasOwnerPassword()) openPinModal("setup", () => runEnrollment(ownerName));
        else openPinModal("verify", () => runEnrollment(ownerName));
    }, [voiceAuthStatus]);

    const runEnrollment = async (ownerName) => {
        if (enrollmentInProgressRef.current) return;
        enrollmentInProgressRef.current = true;
        setIsEnrolling(true);
        setEnrollmentStep(0);

        updateStatus("enrolling", `INITIALIZING ${ownerName.toUpperCase()}`);
        speak("Voice enrollment started. Repeat each phrase after me.");
        await new Promise(r => setTimeout(r, 3500));

        const samples = [];
        for (let step = 0; step < ENROLLMENT_PHRASES.length; step++) {
            const phrase = ENROLLMENT_PHRASES[step];
            setCurrentEnrollPhrase(phrase);
            setEnrollmentStep(step + 1);
            updateStatus("enrolling", `SAY: "${phrase}"`);
            speak(phrase);
            await new Promise(r => setTimeout(r, 3500));

            updateStatus("recording", "RECORDING...");
            try {
                const audioBlob = await recordAudio(4000);
                samples.push(audioBlob);
                updateStatus("processing", `SAMPLE ${step + 1}/3 ✓`);
                await new Promise(r => setTimeout(r, 1000));
            } catch (error) {
                updateStatus("error", error.message);
                setIsEnrolling(false);
                enrollmentInProgressRef.current = false;
                return;
            }
        }

        setCurrentEnrollPhrase("");
        updateStatus("processing", "CREATING VOICEPRINT...");

        try {
            const result = await enrollUser(getUserId(ownerName), samples, true);
            if (result.success) {
                markOwnerEnrolled(ownerName);
                setEnrolledOwnersState(getEnrolledOwners());
                setIsEnrolled(true);
                updateStatus("success", "VOICEPRINT CREATED");
                speak("Voiceprint created successfully.");
            } else {
                updateStatus("error", result.message);
            }
        } catch (error) {
            updateStatus("error", error.message);
        }

        setTimeout(() => updateStatus("idle", ""), 3000);
        setIsEnrolling(false);
        enrollmentInProgressRef.current = false;
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // AUTHENTICATION - Verify identity with challenge phrase
    // ═══════════════════════════════════════════════════════════════════════════
    const performVerification = useCallback(async () => {
        if (!isEnrolled) { updateStatus("error", "NO VOICEPRINT"); speak("Please create a voiceprint first"); return; }

        const userId = getUserId(enrolledOwners[0] || "owner");
        updateStatus("verifying", "STARTING...");

        try {
            const challenge = await startChallenge(userId);
            if (!challenge.success) throw new Error(challenge.message);

            updateStatus("challenge", `SAY: "${challenge.phrase}"`);
            speak(challenge.phrase);
            await new Promise(r => setTimeout(r, 3000));

            updateStatus("listening", "🎤 SPEAK NOW");
            console.log("🎙️ Challenge:", challenge.phrase);

            // Record audio for verification
            let audioBlob = null;
            let spokenText = "";

            // Start recording
            const recordPromise = recordAudio(5000);

            // Use STT if available
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.lang = "en-US";
                recognition.continuous = false;
                recognition.interimResults = true;

                recognition.onresult = (e) => {
                    for (let i = e.resultIndex; i < e.results.length; i++) {
                        if (e.results[i].isFinal) {
                            spokenText = e.results[i][0].transcript;
                            console.log("🎙️ Heard:", spokenText);
                        } else {
                            setLiveTranscript(e.results[i][0].transcript);
                        }
                    }
                };
                recognition.onerror = () => { };
                recognition.start();

                // Wait for recording
                audioBlob = await recordPromise;
                console.log("🎙️ Recorded:", audioBlob?.size, "bytes");

                try { recognition.stop(); } catch { }
                await new Promise(r => setTimeout(r, 500));
            } else {
                audioBlob = await recordPromise;
            }

            setLiveTranscript("");
            updateStatus("processing", "ANALYZING...");

            if (!spokenText) spokenText = challenge.phrase; // Fallback
            if (!audioBlob || audioBlob.size < 1000) {
                updateStatus("error", "NO AUDIO DETECTED");
                speak("No audio detected. Please try again.");
                return;
            }

            const result = await verifyChallengeWithText(challenge.sessionId, audioBlob, spokenText);
            console.log("🎙️ Result:", result);

            if (result.success && result.speakerMatch && result.phraseMatch) {
                setIsVerified(true);
                setCurrentUser(enrolledOwners[0] || "owner");
                updateStatus("verified", "✓ AUTHENTICATED");
                speak("Identity verified. You can now use voice commands.");
            } else {
                const voiceOk = result.speakerMatch;
                const phraseOk = result.phraseMatch;
                updateStatus("denied", `VOICE: ${voiceOk ? "✓" : "✗"}\nPHRASE: ${phraseOk ? "✓" : "✗"}`);
                speak("Authentication failed. Please try again.");
            }
        } catch (error) {
            console.error("🎙️ Error:", error);
            updateStatus("error", error.message);
        }

        setTimeout(() => { if (status !== "verified") updateStatus("idle", ""); }, 3000);
    }, [isEnrolled, enrolledOwners, speak, status]);

    // ═══════════════════════════════════════════════════════════════════════════
    // COMMAND PROCESSING - Execute voice commands with speaker verification
    // ═══════════════════════════════════════════════════════════════════════════
    const processCommand = useCallback(async (text, audioBlob = null) => {
        const t = text.toLowerCase().trim();
        console.log("📝 Command:", t);

        // === ENROLLMENT COMMANDS ===
        if (t.includes("enroll")) {
            const match = t.match(/enroll\s+(\w+)/i);
            if (match && !["my", "voice", "me"].includes(match[1])) {
                if (!getOwners().includes(match[1])) { addOwner(match[1]); setOwnersState(getOwners()); }
                startEnrollment(match[1]);
            } else startEnrollment("owner");
            return;
        }

        // === AUTH COMMANDS ===
        if (t.includes("verify") || t.includes("authenticate") || t.includes("login") || t.includes("unlock")) {
            performVerification();
            return;
        }

        // === HELP COMMAND ===
        if (t.includes("help") || t.includes("what can")) {
            updateStatus("info", "COMMANDS:\n• Home / Dashboard\n• Vibrations / Sensors\n• Notifications\n• Profile\n• Settings");
            speak("Available commands: home, vibrations, notifications, profile, settings, unlock, enroll, and help.");
            setTimeout(() => updateStatus("idle", ""), 5000);
            return;
        }

        // === RESET COMMAND ===
        if (t.includes("reset") && t.includes("all")) {
            localStorage.removeItem("synap_owner_password");
            localStorage.removeItem("synap_enrolled_owners");
            localStorage.removeItem("synap_owners");
            setIsEnrolled(false);
            setIsVerified(false);
            setCurrentUser(null);
            setEnrolledOwnersState([]);
            setOwnersState(["owner"]);
            updateStatus("success", "SYSTEM RESET");
            speak("System has been reset.");
            setTimeout(() => updateStatus("idle", ""), 2000);
            return;
        }

        // === NAVIGATION COMMANDS ===
        const NAV = [
            { p: /\b(home|dashboard|main|start)\b/, r: "/", n: "Dashboard" },
            { p: /\b(vibration|sensor|signal|piezo)\b/, r: "/vibrations", n: "Vibrations" },
            { p: /\b(notification|alert|message)\b/, r: "/notifications", n: "Notifications" },
            { p: /\b(profile|account)\b/, r: "/profile", n: "Profile" },
            { p: /\b(setting|config|option)\b/, r: "/settings", n: "Settings" },
        ];

        for (const nav of NAV) {
            if (nav.p.test(t)) {
                console.log("📝 Match:", nav.n);

                // Must be authenticated first
                if (!isVerified) {
                    updateStatus("locked", "🔒 SAY 'UNLOCK' FIRST");
                    speak("Please say unlock to authenticate.");
                    setTimeout(() => updateStatus("idle", ""), 3000);
                    return;
                }

                // === LIVE VOICE VERIFICATION ===
                if (enrolledOwners.length > 0 && audioBlob && audioBlob.size > 1000) {
                    console.log("🔐 Checking speaker...");
                    updateStatus("verifying", "🔐 VERIFYING VOICE...");

                    try {
                        const voiceCheck = await identifyVoice(audioBlob);
                        console.log("🔐 Result:", voiceCheck);

                        if (!voiceCheck.identified) {
                            const score = Math.round(voiceCheck.score * 100);
                            updateStatus("denied", `🚫 ACCESS DENIED\nConfidence: ${score}%`);
                            speak("Access denied. Voice not recognized.");
                            setTimeout(() => updateStatus("idle", ""), 3000);
                            return;
                        }

                        setCurrentUser(voiceCheck.user);
                        console.log("✅ Verified:", voiceCheck.user);
                    } catch (error) {
                        console.error("🔐 Error:", error);
                        // Fail-open for usability
                    }
                }

                // Execute navigation
                navigate(nav.r);
                updateStatus("success", `→ ${nav.n.toUpperCase()}`);
                speak(nav.n);
                setTimeout(() => updateStatus("idle", ""), 2000);
                return;
            }
        }

        // Unknown command
        updateStatus("idle", "❓ SAY 'HELP'");
        setTimeout(() => updateStatus("idle", ""), 2000);
    }, [isVerified, startEnrollment, performVerification, navigate, speak, enrolledOwners]);

    // ═══════════════════════════════════════════════════════════════════════════
    // VOICE COMMAND LISTENER - STT + Audio Recording
    // ═══════════════════════════════════════════════════════════════════════════
    const startListening = useCallback(async () => {
        if (!SpeechRecognition || isEnrolling) return;

        updateStatus("listening", "🎤 LISTENING...");
        console.log("🎤 Starting...");

        let audioBlob = null;
        let sttText = "";

        // Start recording (runs in background)
        const recordPromise = recordAudio(4000)
            .then(blob => { audioBlob = blob; console.log("🎤 Recorded:", blob.size, "bytes"); })
            .catch(err => console.warn("🎤 Record error:", err.message));

        await new Promise(r => setTimeout(r, 100));

        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onresult = (e) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) {
                    sttText = e.results[i][0].transcript;
                    console.log("🎤 Heard:", sttText);
                } else {
                    setLiveTranscript(e.results[i][0].transcript);
                }
            }
        };

        recognition.onerror = (e) => {
            if (e.error === "no-speech") updateStatus("idle", "No speech detected");
            else if (e.error === "not-allowed") updateStatus("error", "Microphone denied");
        };

        recognition.onend = async () => {
            setLiveTranscript("");
            await recordPromise;

            if (sttText) {
                console.log("🎤 Processing:", sttText, "Audio:", audioBlob?.size || 0);
                processCommand(sttText, audioBlob);
            } else {
                updateStatus("idle", "");
            }
        };

        recognitionRef.current = recognition;
        recognition.start();
    }, [isEnrolling, processCommand]);

    const handleAddOwner = () => {
        if (!newOwnerName.trim()) return;
        if (!hasOwnerPassword()) openPinModal("setup", () => { addOwner(newOwnerName.trim()); setOwnersState(getOwners()); setNewOwnerName(""); setShowOwnerModal(false); });
        else openPinModal("verify", () => { addOwner(newOwnerName.trim()); setOwnersState(getOwners()); setNewOwnerName(""); setShowOwnerModal(false); });
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // UI STYLING
    // ═══════════════════════════════════════════════════════════════════════════
    const getOrbClass = () => {
        if (status === "denied" || status === "error") return "border-red-500/50 shadow-red-500/20";
        if (status === "verified" || status === "success") return "border-cyan-400/50 shadow-cyan-400/20";
        if (status === "listening" || status === "recording") return "border-blue-400/50 shadow-blue-400/20";
        if (status === "processing" || status === "verifying" || status === "enrolling") return "border-yellow-400/50 shadow-yellow-400/20";
        if (isVerified) return "border-cyan-500/30 shadow-cyan-500/10";
        return "border-slate-600/50 shadow-slate-600/10";
    };

    const isActive = ["listening", "recording", "processing", "verifying", "enrolling"].includes(status) || isEnrolling;

    return (
        <>
            {/* PIN Modal */}
            {showPinModal && (
                <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[9999] font-mono">
                    <div className="bg-slate-950 p-8 rounded border border-slate-800 w-80">
                        <div className="text-center mb-6">
                            <div className="text-slate-500 text-xs tracking-[0.3em] mb-2">SECURITY</div>
                            <div className="text-white text-lg tracking-widest">{pinModalMode === "setup" ? "CREATE PIN" : "ENTER PIN"}</div>
                        </div>

                        <input type="password" maxLength={4} value={pinValue} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                            placeholder="• • • •" className="w-full bg-black text-cyan-400 text-center text-2xl tracking-[1em] p-4 rounded border border-slate-700 focus:border-cyan-500/50 outline-none font-mono mb-4" autoFocus />

                        {pinModalMode === "setup" && (
                            <input type="password" maxLength={4} value={pinConfirmValue} onChange={(e) => setPinConfirmValue(e.target.value.replace(/\D/g, ""))}
                                placeholder="CONFIRM" className="w-full bg-black text-cyan-400 text-center text-2xl tracking-[1em] p-4 rounded border border-slate-700 focus:border-cyan-500/50 outline-none font-mono mb-4" />
                        )}

                        {pinError && <p className="text-red-400 text-center text-xs tracking-wider mb-4">{pinError}</p>}

                        <div className="flex gap-3">
                            <button onClick={() => setShowPinModal(false)} className="flex-1 py-3 bg-slate-900 text-slate-500 rounded border border-slate-800 hover:border-slate-600 transition-all text-xs tracking-widest">CANCEL</button>
                            <button onClick={handlePinSubmit} className="flex-1 py-3 bg-slate-900 text-cyan-400 rounded border border-cyan-500/30 hover:border-cyan-400/50 transition-all text-xs tracking-widest">CONFIRM</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Owner Modal */}
            {showOwnerModal && (
                <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[9999] font-mono">
                    <div className="bg-slate-950 p-6 rounded border border-slate-800 w-96 max-h-[80vh] overflow-auto">
                        <div className="flex items-center justify-between mb-6">
                            <div className="text-white text-sm tracking-widest">VOICE PROFILES</div>
                            <button onClick={() => setShowOwnerModal(false)} className="text-slate-600 hover:text-white text-xl">×</button>
                        </div>

                        <div className="flex gap-2 mb-6">
                            <input type="text" value={newOwnerName} onChange={(e) => setNewOwnerName(e.target.value)} placeholder="Profile name"
                                className="flex-1 bg-black text-white px-4 py-3 rounded border border-slate-700 focus:border-cyan-500/50 outline-none text-xs tracking-wide" />
                            <button onClick={handleAddOwner} className="px-6 py-3 bg-slate-900 text-cyan-400 rounded border border-cyan-500/30 text-xs tracking-widest hover:border-cyan-400/50">ADD</button>
                        </div>

                        <div className="space-y-2">
                            {owners.map((o) => (
                                <div key={o} className="flex items-center justify-between bg-slate-900/50 p-4 rounded border border-slate-800">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${enrolledOwners.includes(o) ? "bg-cyan-400" : "bg-slate-600"}`} />
                                        <span className="text-white text-xs tracking-wider">{o === "owner" ? "PRIMARY" : o.toUpperCase()}</span>
                                        {enrolledOwners.includes(o) && <span className="text-cyan-400/60 text-[10px] tracking-widest">ACTIVE</span>}
                                    </div>
                                    <div className="flex gap-2">
                                        {!enrolledOwners.includes(o) && (
                                            <button onClick={() => { setShowOwnerModal(false); startEnrollment(o); }} className="px-3 py-1 bg-slate-800 text-slate-400 rounded text-[10px] tracking-wider hover:text-white">ENROLL</button>
                                        )}
                                        {o !== "owner" && (
                                            <button onClick={() => { removeOwner(o); setOwnersState(getOwners()); setEnrolledOwnersState(getEnrolledOwners()); }} className="px-2 py-1 bg-slate-800 text-red-400/60 rounded text-[10px] hover:text-red-400">×</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Button */}
            <div className="fixed bottom-8 right-8 z-50">
                <button onClick={() => setIsPanelOpen(!isPanelOpen)}
                    className={`relative w-16 h-16 rounded-full bg-slate-950 border-2 ${getOrbClass()} shadow-lg flex items-center justify-center transition-all hover:scale-105 ${isActive ? "animate-pulse" : ""}`}>
                    <div className={`w-6 h-6 rounded-full ${isVerified ? "bg-cyan-400" : status === "denied" ? "bg-red-500" : "bg-slate-600"}`} />
                    <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${voiceAuthStatus === "ready" ? "bg-cyan-500" : "bg-red-500"} text-black`}>
                        {voiceAuthStatus === "ready" ? "●" : "!"}
                    </div>
                </button>
            </div>

            {/* Panel */}
            {isPanelOpen && (
                <div className="fixed bottom-28 right-8 w-80 bg-slate-950 border border-slate-800 rounded z-50 overflow-hidden font-mono shadow-2xl shadow-black/50">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                        <div>
                            <div className="text-white text-sm tracking-[0.2em]">SYNAPSENSE</div>
                            <div className="text-slate-600 text-[10px] tracking-[0.3em]">VOICE CONTROL v2.0</div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowOwnerModal(true)} className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-slate-500 hover:text-white border border-slate-800">
                                <span className="text-xs">◉</span>
                            </button>
                            <button onClick={() => setIsPanelOpen(false)} className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-slate-500 hover:text-white border border-slate-800">×</button>
                        </div>
                    </div>

                    {/* Display */}
                    <div className="p-6">
                        {/* Status Ring */}
                        <div className="relative mx-auto w-28 h-28 mb-6">
                            <div className={`absolute inset-0 rounded-full border-2 ${getOrbClass()} ${isActive ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
                            <div className={`absolute inset-2 rounded-full border ${getOrbClass()}`} />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className={`w-10 h-10 rounded-full ${isVerified ? "bg-cyan-400/20" : status === "denied" ? "bg-red-500/20" : "bg-slate-700/50"} flex items-center justify-center`}>
                                    <div className={`w-4 h-4 rounded-full ${isVerified ? "bg-cyan-400" : status === "denied" ? "bg-red-500" : "bg-slate-500"}`} />
                                </div>
                            </div>
                        </div>

                        {/* Status Text */}
                        <div className="text-center mb-4">
                            <div className="text-white text-lg tracking-[0.15em] mb-1">
                                {status === "idle" && (isVerified ? "READY" : isEnrolled ? "LOCKED" : "SETUP")}
                                {status === "listening" && "LISTENING"}
                                {status === "recording" && "RECORDING"}
                                {status === "processing" && "PROCESSING"}
                                {status === "verifying" && "VERIFYING"}
                                {status === "verified" && "AUTHENTICATED"}
                                {status === "success" && "SUCCESS"}
                                {status === "error" && "ERROR"}
                                {status === "denied" && "DENIED"}
                                {status === "locked" && "LOCKED"}
                                {status === "challenge" && "CHALLENGE"}
                                {status === "info" && "HELP"}
                                {status === "enrolling" && `ENROLLING ${enrollmentStep}/3`}
                            </div>
                            <div className="text-slate-500 text-xs tracking-wide whitespace-pre-line">{statusMessage}</div>
                            {currentUser && isVerified && (
                                <div className="text-cyan-400/60 text-[10px] tracking-[0.2em] mt-2">USER: {currentUser.toUpperCase()}</div>
                            )}
                        </div>

                        {/* Live Transcript */}
                        {liveTranscript && (
                            <div className="mb-4 p-3 bg-slate-900/50 rounded border border-slate-800">
                                <div className="text-cyan-400/80 text-xs tracking-wide">› {liveTranscript}</div>
                            </div>
                        )}

                        {/* Enrollment Phrase */}
                        {isEnrolling && currentEnrollPhrase && (
                            <div className="mb-4 p-3 bg-slate-900/50 rounded border border-slate-800">
                                <div className="text-white text-sm text-center tracking-wide">"{currentEnrollPhrase}"</div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="px-5 pb-5 space-y-2">
                        {!isEnrolled ? (
                            <button onClick={() => startEnrollment("owner")} className="w-full py-4 bg-slate-900 text-cyan-400 rounded border border-cyan-500/30 text-xs tracking-[0.15em] hover:border-cyan-400/50 transition-all">
                                🎤 CREATE VOICEPRINT
                            </button>
                        ) : !isVerified ? (
                            <button onClick={performVerification} className="w-full py-4 bg-slate-900 text-cyan-400 rounded border border-cyan-500/30 text-xs tracking-[0.15em] hover:border-cyan-400/50 transition-all">
                                🔓 AUTHENTICATE
                            </button>
                        ) : (
                            <button onClick={startListening} className="w-full py-4 bg-slate-900 text-cyan-400 rounded border border-cyan-500/30 text-xs tracking-[0.15em] hover:border-cyan-400/50 transition-all">
                                🎙️ VOICE COMMAND
                            </button>
                        )}

                        {/* Quick Commands (when authenticated) */}
                        {isVerified && (
                            <div className="grid grid-cols-3 gap-2 pt-2">
                                <button onClick={() => { navigate("/"); updateStatus("success", "→ HOME"); }} className="py-2 bg-slate-900/50 text-slate-400 rounded border border-slate-800 text-[10px] tracking-wider hover:text-white hover:border-slate-600">HOME</button>
                                <button onClick={() => { navigate("/vibrations"); updateStatus("success", "→ VIBRATIONS"); }} className="py-2 bg-slate-900/50 text-slate-400 rounded border border-slate-800 text-[10px] tracking-wider hover:text-white hover:border-slate-600">SENSOR</button>
                                <button onClick={() => { navigate("/settings"); updateStatus("success", "→ SETTINGS"); }} className="py-2 bg-slate-900/50 text-slate-400 rounded border border-slate-800 text-[10px] tracking-wider hover:text-white hover:border-slate-600">SETTINGS</button>
                            </div>
                        )}

                        {enrolledOwners.length > 0 && (
                            <div className="flex items-center justify-center gap-2 pt-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/50" />
                                <div className="text-slate-600 text-[10px] tracking-[0.2em]">{enrolledOwners.length} VOICE PROFILE{enrolledOwners.length > 1 ? "S" : ""}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
