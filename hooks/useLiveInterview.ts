import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { ConnectionStatus, PersonaId, InterviewFeedback, TranscriptItem, CandidateBackground, PersonaConfig } from '../types';
import { PERSONAS, CANDIDATE_BACKGROUNDS } from '../constants';
import { decodeAudioData, base64ToBytes, float32ToPCM16Blob } from '../utils/audioUtils';

interface UseLiveInterviewProps {
  onAudioLevelUpdate: (inputLevel: number, outputLevel: number) => void;
  personaId: PersonaId;
  candidateBackground: CandidateBackground;
  interviewerName: string;
  voiceName: string;
}

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const useLiveInterview = ({ onAudioLevelUpdate, personaId, candidateBackground, interviewerName, voiceName }: UseLiveInterviewProps) => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]); 
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);

  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  
  // Audio Nodes & Streams
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputGainNodeRef = useRef<GainNode | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);

  // Live API Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  
  // Playback State
  const nextStartTimeRef = useRef<number>(0);
  const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Transcription & History
  const transcriptRef = useRef<TranscriptItem[]>([]);
  const currentInputTranscriptionRef = useRef<string>('');
  const currentOutputTranscriptionRef = useRef<string>('');

  // Inactivity Timer
  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Ref to hold the stop function to avoid circular dependencies in callbacks
  const stopInterviewRef = useRef<() => void>(() => {});

  // Animation Frame for visualizer
  const visualizerFrameRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    // Stop all scheduled sources
    scheduledSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (e) { /* ignore */ }
    });
    scheduledSourcesRef.current.clear();

    // Clear Inactivity Timeout
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }

    // Close Audio Contexts
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }

    // Stop Media Stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Close Live Session
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => {
        try {
          session.close();
        } catch (e) {
          console.error("Error closing session:", e);
        }
      });
      sessionPromiseRef.current = null;
    }
    
    // Stop Visualizer
    if (visualizerFrameRef.current) {
      cancelAnimationFrame(visualizerFrameRef.current);
      visualizerFrameRef.current = null;
    }

    setStatus(ConnectionStatus.DISCONNECTED);
  }, []);

  const generateFeedback = async (transcriptHistory: TranscriptItem[], persona: PersonaConfig, background: CandidateBackground, name: string) => {
    if (transcriptHistory.length < 2) return; 

    try {
      setIsGeneratingFeedback(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const backgroundInfo = CANDIDATE_BACKGROUNDS[background];
      
      const prompt = `
        You are an expert Talent Acquisition Director and Finance Executive at a top-tier financial institution.
        You have just conducted a job interview for a Senior Finance Manager position.

        INTERVIEWER PROFILE:
        - Persona Name: "${name}"
        - Style: ${persona.subLabel}
        - Description: ${persona.description}
        - Operational Guidelines: ${persona.systemInstruction}
        
        CANDIDATE PROFILE:
        - Background: ${backgroundInfo.label}
        - Context: ${backgroundInfo.description}

        YOUR TASK:
        Analyze the candidate's performance based on the transcript provided below.
        
        SCORING GUIDELINES:
        - Adjust expectations based on candidate background (e.g., forgive some lack of practical experience for recent grads if theory is strong, but demand high polish from experienced pros).
        ${persona.id === 'aggressive' ? 
          `• SCORE HEAVILY ON: Grace under pressure, ability to handle interruptions, conciseness (no fluff), technical precision, and defending assumptions against skepticism.
           • DEDUCT POINTS FOR: Vagueness, long-winded answers, getting flustered, or generic "textbook" responses.` : 
          persona.id === 'collaborative' ?
          `• SCORE HEAVILY ON: Cultural fit, collaborative language ("we" vs "I"), enthusiasm, problem-solving creativity, and building rapport.
           • DEDUCT POINTS FOR: Arrogance, rigidity, lack of warmth, or treating the interview as purely transactional.` :
          `• SCORE HEAVILY ON: Structure (STAR method), clarity, professional demeanor, completeness of answers, and logical flow.
           • DEDUCT POINTS FOR: Unstructured rambling, lack of specific examples, or failing to answer the specific question asked.`
        }

        GENERAL CRITERIA:
        1. Technical Knowledge (Finance, Accounting, Strategy).
        2. Communication Style (Clarity, Conciseness, Confidence).
        3. Handling of specific interview dynamics (Persona Alignment).

        OUTPUT REQUIREMENTS:
        Provide a structured JSON response.
        - 'overallScore': Integer from 1-10. Weighted average of the breakdown.
        - 'scoreBreakdown':
             - 'technical': 1-10 (Depth of financial concepts, correctness).
             - 'communication': 1-10 (Clarity, structure, brevity).
             - 'personaAlignment': 1-10 (How well they handled the specific persona - e.g., staying calm vs aggressive, or being warm vs collaborative).
        - 'summary': A brief executive summary explaining the score in the context of the persona and candidate background.
        - 'strengths' & 'areasForImprovement':
           - 'point': The description of the strength or weakness.
           - 'quote': The EXACT text segment from the transcript that supports your point. If there is no exact quote, leave it empty.

        TRANSCRIPT:
        ${transcriptHistory.map(t => `${t.role.toUpperCase()}: ${t.text}`).join('\n')}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallScore: { type: Type.INTEGER, description: "Overall Score from 1-10" },
              scoreBreakdown: {
                type: Type.OBJECT,
                properties: {
                  technical: { type: Type.INTEGER, description: "Technical Skills 1-10" },
                  communication: { type: Type.INTEGER, description: "Communication Skills 1-10" },
                  personaAlignment: { type: Type.INTEGER, description: "Alignment with Persona 1-10" },
                },
                required: ['technical', 'communication', 'personaAlignment']
              },
              summary: { type: Type.STRING, description: "A brief executive summary of performance" },
              strengths: { 
                type: Type.ARRAY, 
                items: { 
                  type: Type.OBJECT,
                  properties: {
                    point: { type: Type.STRING },
                    quote: { type: Type.STRING }
                  },
                  required: ['point', 'quote']
                } 
              },
              areasForImprovement: { 
                type: Type.ARRAY, 
                items: { 
                  type: Type.OBJECT,
                  properties: {
                    point: { type: Type.STRING },
                    quote: { type: Type.STRING }
                  },
                  required: ['point', 'quote']
                } 
              }
            }
          }
        }
      });

      if (response.text) {
        setFeedback(JSON.parse(response.text));
      }

    } catch (e) {
      console.error("Failed to generate feedback", e);
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const connect = useCallback(async () => {
    try {
      if (!process.env.API_KEY) {
        throw new Error("API Key not found in environment.");
      }

      // Reset state
      setStatus(ConnectionStatus.CONNECTING);
      setError(null);
      setFeedback(null);
      setTranscript([]);
      transcriptRef.current = [];
      currentInputTranscriptionRef.current = '';
      currentOutputTranscriptionRef.current = '';

      // Get Persona Config
      const personaConfig = PERSONAS[personaId];
      if (!personaConfig) {
        throw new Error("Invalid persona configuration");
      }
      
      // Get Background Config
      const backgroundConfig = CANDIDATE_BACKGROUNDS[candidateBackground];

      // 1. Setup Audio Input (Microphone)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputCtx;

      const source = inputCtx.createMediaStreamSource(stream);
      inputSourceRef.current = source;

      // Processor for capturing raw PCM
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(inputCtx.destination); 

      // 2. Setup Audio Output (Speaker)
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputAudioContextRef.current = outputCtx;
      
      const outputGain = outputCtx.createGain();
      outputGainNodeRef.current = outputGain;

      // Analyzer for visualizer
      const analyzer = outputCtx.createAnalyser();
      analyzer.fftSize = 256;
      analyzerRef.current = analyzer;
      
      outputGain.connect(analyzer);
      analyzer.connect(outputCtx.destination);

      nextStartTimeRef.current = 0;

      // 3. Connect to Gemini Live API
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const fullSystemInstruction = `
        Identity: Your name is ${interviewerName}.
        ${personaConfig.systemInstruction}

        IMPORTANT: CANDIDATE BACKGROUND CONTEXT
        ${backgroundConfig.instruction}
      `;

      // Helper to reset inactivity timer
      const resetInactivityTimer = () => {
        if (inactivityTimeoutRef.current) {
          clearTimeout(inactivityTimeoutRef.current);
        }
        inactivityTimeoutRef.current = setTimeout(() => {
           console.log("Inactivity timeout: Stopping interview");
           stopInterviewRef.current();
        }, INACTIVITY_TIMEOUT_MS);
      };

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
          },
          systemInstruction: fullSystemInstruction,
          inputAudioTranscription: { },
          outputAudioTranscription: { },
        },
        callbacks: {
          onopen: () => {
            console.log("Live Session Connected");
            setStatus(ConnectionStatus.CONNECTED);
            resetInactivityTimer();
            
            // Start processing audio input
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = float32ToPCM16Blob(inputData);
              
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Reset timer on any message from server (indicates activity)
            resetInactivityTimer();

            const { serverContent } = msg;

            if (serverContent?.outputTranscription?.text) {
               currentOutputTranscriptionRef.current += serverContent.outputTranscription.text;
            }
            if (serverContent?.inputTranscription?.text) {
               currentInputTranscriptionRef.current += serverContent.inputTranscription.text;
            }

            // Handle Turn Completion
            if (serverContent?.turnComplete) {
                if (currentInputTranscriptionRef.current.trim()) {
                    transcriptRef.current.push({
                        role: 'user',
                        text: currentInputTranscriptionRef.current.trim(),
                        timestamp: Date.now()
                    });
                    currentInputTranscriptionRef.current = '';
                }
                if (currentOutputTranscriptionRef.current.trim()) {
                    transcriptRef.current.push({
                        role: 'model',
                        text: currentOutputTranscriptionRef.current.trim(),
                        timestamp: Date.now()
                    });
                    currentOutputTranscriptionRef.current = '';
                }
            }

            // Handle Audio Output
            const audioData = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              const audioCtx = outputAudioContextRef.current;
              if (audioCtx && outputGainNodeRef.current) {
                const pcmData = base64ToBytes(audioData);
                const audioBuffer = await decodeAudioData(pcmData, audioCtx, 24000, 1);
                
                const startTime = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
                
                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputGainNodeRef.current);
                source.start(startTime);
                
                nextStartTimeRef.current = startTime + audioBuffer.duration;
                scheduledSourcesRef.current.add(source);

                source.onended = () => {
                  scheduledSourcesRef.current.delete(source);
                };
              }
            }

            // Handle Interruption
            if (serverContent?.interrupted) {
              if (currentOutputTranscriptionRef.current.trim()) {
                transcriptRef.current.push({
                    role: 'model',
                    text: currentOutputTranscriptionRef.current.trim() + " [Interrupted]",
                    timestamp: Date.now()
                });
                currentOutputTranscriptionRef.current = '';
              }
              
              console.log("Model interrupted by user");
              scheduledSourcesRef.current.forEach(s => {
                try { s.stop(); } catch(e) {}
              });
              scheduledSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            console.log("Session closed");
            setStatus(ConnectionStatus.DISCONNECTED);
          },
          onerror: (e) => {
            console.error("Session error:", e);
            setError("Connection error. Please try again.");
            cleanup();
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;

      // Start Visualizer Loop
      const inputAnalyzer = inputCtx.createAnalyser();
      inputAnalyzer.fftSize = 256;
      const inputSource = inputSourceRef.current;
      if(inputSource) inputSource.connect(inputAnalyzer);

      const rigorousUpdateVisualizer = () => {
        let inLvl = 0;
        let outLvl = 0;

        if (inputAnalyzer) {
             const data = new Uint8Array(inputAnalyzer.frequencyBinCount);
             inputAnalyzer.getByteTimeDomainData(data);
             let sum = 0;
             for(let i=0; i<data.length; i++) {
                 const v = (data[i] - 128)/128;
                 sum += v*v;
             }
             inLvl = Math.sqrt(sum/data.length);
        }

        if (analyzerRef.current) {
            const data = new Uint8Array(analyzerRef.current.frequencyBinCount);
            analyzerRef.current.getByteTimeDomainData(data);
            let sum = 0;
            for(let i=0; i<data.length; i++) {
                const v = (data[i] - 128)/128;
                sum += v*v;
            }
            outLvl = Math.sqrt(sum/data.length);
        }

        onAudioLevelUpdate(inLvl, outLvl);
        visualizerFrameRef.current = requestAnimationFrame(rigorousUpdateVisualizer);
      }

      visualizerFrameRef.current = requestAnimationFrame(rigorousUpdateVisualizer);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to initialize audio or connection.");
      setStatus(ConnectionStatus.ERROR);
    }
  }, [cleanup, onAudioLevelUpdate, personaId, candidateBackground, interviewerName, voiceName]);

  const stopAndGenerateFeedback = useCallback(() => {
    // 1. Capture any remaining partial transcript
    if (currentInputTranscriptionRef.current.trim()) {
        transcriptRef.current.push({ role: 'user', text: currentInputTranscriptionRef.current.trim(), timestamp: Date.now() });
    }
    if (currentOutputTranscriptionRef.current.trim()) {
        transcriptRef.current.push({ role: 'model', text: currentOutputTranscriptionRef.current.trim(), timestamp: Date.now() });
    }

    // Update state to trigger UI
    setTranscript([...transcriptRef.current]);

    // 2. Cleanup
    cleanup();

    // 3. Generate Feedback if we have a conversation
    if (transcriptRef.current.length > 0) {
        const personaConfig = PERSONAS[personaId];
        generateFeedback(transcriptRef.current, personaConfig, candidateBackground, interviewerName);
    }
  }, [cleanup, personaId, candidateBackground, interviewerName]);

  // Update the ref whenever stopAndGenerateFeedback changes so the timeout calls the latest version
  useEffect(() => {
    stopInterviewRef.current = stopAndGenerateFeedback;
  }, [stopAndGenerateFeedback]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    status,
    error,
    startInterview: connect,
    stopInterview: stopAndGenerateFeedback,
    feedback,
    transcript,
    isGeneratingFeedback
  };
};
