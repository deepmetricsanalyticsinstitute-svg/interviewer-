export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AudioVisualizerState {
  inputLevel: number; // 0 to 1
  outputLevel: number; // 0 to 1
}

export type PersonaId = 'aggressive' | 'neutral' | 'collaborative';

export type CandidateBackground = 'recent_grad' | 'experienced' | 'career_changer';

export interface PersonaConfig {
  id: PersonaId;
  label: string;
  subLabel: string;
  description: string;
  voice: string;
  systemInstruction: string;
  color: string;
}

export interface TranscriptItem {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface FeedbackItem {
  point: string;
  quote: string; // The exact text from the transcript to highlight
}

export interface ScoreBreakdown {
  technical: number;
  communication: number;
  personaAlignment: number;
}

export interface InterviewFeedback {
  overallScore: number; // 1-10
  scoreBreakdown: ScoreBreakdown;
  summary: string;
  strengths: FeedbackItem[];
  areasForImprovement: FeedbackItem[];
}