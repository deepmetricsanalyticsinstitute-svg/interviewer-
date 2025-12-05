import React, { useState, useEffect } from 'react';
import { useLiveInterview } from './hooks/useLiveInterview';
import Visualizer from './components/Visualizer';
import { ConnectionStatus, PersonaId, TranscriptItem, FeedbackItem, CandidateBackground } from './types';
import { PERSONAS, CANDIDATE_BACKGROUNDS, AVAILABLE_VOICES } from './constants';

const App: React.FC = () => {
  const [audioState, setAudioState] = useState({ input: 0, output: 0 });
  const [selectedPersonaId, setSelectedPersonaId] = useState<PersonaId>('aggressive');
  const [selectedBackground, setSelectedBackground] = useState<CandidateBackground>('experienced');
  const [interviewerName, setInterviewerName] = useState(PERSONAS['aggressive'].label);
  const [selectedVoice, setSelectedVoice] = useState(PERSONAS['aggressive'].voice);
  
  const handleLevelUpdate = (input: number, output: number) => {
    setAudioState({ input, output });
  };

  const handlePersonaChange = (id: PersonaId) => {
    setSelectedPersonaId(id);
    setInterviewerName(PERSONAS[id].label);
    setSelectedVoice(PERSONAS[id].voice);
  };

  const { status, error, startInterview, stopInterview, feedback, transcript, isGeneratingFeedback } = useLiveInterview({
    onAudioLevelUpdate: handleLevelUpdate,
    personaId: selectedPersonaId,
    candidateBackground: selectedBackground,
    interviewerName: interviewerName,
    voiceName: selectedVoice
  });

  const isConnected = status === ConnectionStatus.CONNECTED;
  const isConnecting = status === ConnectionStatus.CONNECTING;
  const activePersona = PERSONAS[selectedPersonaId];

  // Helper to highlight text in transcript
  const renderHighlightedText = (text: string) => {
    if (!feedback) return text;

    // Collect all quotes to highlight with their type
    const highlights: { text: string; type: 'strength' | 'weakness' }[] = [];
    
    feedback.strengths.forEach(s => {
      if (s.quote && text.includes(s.quote)) {
        highlights.push({ text: s.quote, type: 'strength' });
      }
    });

    feedback.areasForImprovement.forEach(w => {
      if (w.quote && text.includes(w.quote)) {
        highlights.push({ text: w.quote, type: 'weakness' });
      }
    });

    if (highlights.length === 0) return text;

    // Sort by length desc to handle overlapping (longest first) - simplified approach
    // For a robust solution we'd need to handle indices, but React splitting is tricky.
    // We will use a simple split/replace approach for the *first* match found or use a regex construction.
    
    // Construct a regex from all quotes
    const pattern = new RegExp(`(${highlights.map(h => h.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    
    const parts = text.split(pattern);

    return parts.map((part, i) => {
      const highlight = highlights.find(h => h.text === part);
      if (highlight) {
        const colorClass = highlight.type === 'strength' 
          ? 'bg-emerald-500/20 text-emerald-200 decoration-emerald-500/50 underline decoration-2 underline-offset-2' 
          : 'bg-gold-500/20 text-gold-200 decoration-gold-500/50 underline decoration-2 underline-offset-2';
        
        return (
          <mark key={i} className={`bg-transparent rounded px-0.5 ${colorClass}`}>
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-gold-500/30 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gold-500 rounded-sm flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              <svg className="w-5 h-5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-serif font-semibold tracking-wide text-slate-100">
              DeepMetrics <span className="text-gold-500">Analytics</span> Recruitment
            </h1>
          </div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-widest hidden sm:block">
            Confidential Interview Simulation
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Decorative Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,black,transparent)] pointer-events-none"></div>

        <div className="max-w-4xl w-full z-0 flex flex-col items-center gap-8 my-8">
          
          {/* Status Indicator */}
          <div className={`transition-all duration-500 ${isConnected ? 'opacity-100' : 'opacity-0 translate-y-4 h-0'}`}>
             <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-sm text-gold-400 shadow-lg">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gold-500"></span>
                </span>
                Live Session: {interviewerName} ({activePersona.subLabel})
             </div>
          </div>

          {/* Visualizer Container */}
          <div className={`relative w-full max-w-lg aspect-[4/3] bg-slate-850 rounded-3xl shadow-2xl border border-slate-700/50 overflow-hidden ring-1 ring-white/5 transition-all duration-700 ${feedback ? 'hidden' : 'block'}`}>
             {/* Overlay info when not connected */}
             {!isConnected && !isConnecting && !isGeneratingFeedback && (
               <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900/60 backdrop-blur-sm p-6 text-center">
                  <h2 className="text-2xl font-serif text-white mb-2">Ready for your interview?</h2>
                  <p className="text-slate-400 max-w-xs mb-6">
                    Customize your interview settings below and start the simulation.
                  </p>
               </div>
             )}
             
             {isConnecting && (
               <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900/80 backdrop-blur-sm">
                  <div className="w-10 h-10 border-4 border-gold-500/30 border-t-gold-500 rounded-full animate-spin mb-4"></div>
                  <p className="text-gold-500 font-medium">Connecting to secure line...</p>
               </div>
             )}

            {isGeneratingFeedback && (
               <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900/95 backdrop-blur-sm">
                  <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                  <p className="text-emerald-500 font-medium animate-pulse">Analyzing Interview Performance...</p>
                  <p className="text-slate-500 text-sm mt-2">Processing transcript & behavioral data</p>
               </div>
             )}

             <Visualizer 
                inputLevel={audioState.input} 
                outputLevel={audioState.output} 
                isActive={isConnected} 
             />

             {/* Bottom bar inside visualizer */}
             <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-slate-950 to-transparent flex items-end justify-center pb-4 opacity-50">
               <span className="text-xs text-slate-400 tracking-wider font-mono">GEMINI 2.5 LIVE AUDIO PROTOCOL</span>
             </div>
          </div>

          {/* FEEDBACK REPORT UI */}
          {feedback && !isGeneratingFeedback && !isConnected && (
            <div className="w-full space-y-8 animate-[fadeIn_0.5s_ease-out]">
              
              {/* Report Card */}
              <div className="bg-slate-850 rounded-2xl border border-slate-700 p-8 shadow-2xl">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 border-b border-slate-800 pb-6 gap-6">
                  <div>
                    <h2 className="text-3xl font-serif text-white mb-2">Performance Report</h2>
                    <p className="text-slate-400 text-sm">Detailed analysis of your interview session with <span className="text-gold-400 font-semibold">{interviewerName}</span></p>
                  </div>
                  
                  <div className="flex flex-col items-end">
                    <span className="text-slate-500 text-xs uppercase tracking-wider font-bold mb-1">Overall Score</span>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-4xl font-bold 
                        ${feedback.overallScore >= 8 ? 'text-emerald-400' : 
                          feedback.overallScore >= 5 ? 'text-gold-400' : 'text-red-400'}`}>
                        {feedback.overallScore}
                      </span>
                      <span className="text-slate-600 text-xl font-medium">/10</span>
                    </div>
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                   <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-300 font-medium text-sm">Technical Skills</span>
                        <span className="text-white font-bold">{feedback.scoreBreakdown.technical}/10</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full transition-all duration-1000" 
                          style={{width: `${feedback.scoreBreakdown.technical * 10}%`}}
                        ></div>
                      </div>
                   </div>
                   <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-300 font-medium text-sm">Communication</span>
                        <span className="text-white font-bold">{feedback.scoreBreakdown.communication}/10</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 rounded-full transition-all duration-1000" 
                          style={{width: `${feedback.scoreBreakdown.communication * 10}%`}}
                        ></div>
                      </div>
                   </div>
                   <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-300 font-medium text-sm">Persona Alignment</span>
                        <span className="text-white font-bold">{feedback.scoreBreakdown.personaAlignment}/10</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gold-500 rounded-full transition-all duration-1000" 
                          style={{width: `${feedback.scoreBreakdown.personaAlignment * 10}%`}}
                        ></div>
                      </div>
                   </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-slate-300 font-medium mb-2 uppercase text-xs tracking-wider">Executive Summary</h3>
                    <p className="text-slate-400 leading-relaxed text-sm bg-slate-900/50 p-4 rounded-lg border border-slate-800">
                      {feedback.summary}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-emerald-400 font-medium mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Strengths
                      </h3>
                      <ul className="space-y-3">
                        {feedback.strengths.map((item, i) => (
                          <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 mt-1.5 flex-shrink-0"></span>
                            <div className="flex flex-col">
                              <span className="leading-relaxed">{item.point}</span>
                              {item.quote && (
                                <span className="text-xs text-slate-500 mt-1 italic border-l-2 border-slate-700 pl-2">
                                  "{item.quote}"
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-gold-400 font-medium mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Areas for Improvement
                      </h3>
                      <ul className="space-y-3">
                        {feedback.areasForImprovement.map((item, i) => (
                          <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-gold-500/50 mt-1.5 flex-shrink-0"></span>
                            <div className="flex flex-col">
                              <span className="leading-relaxed">{item.point}</span>
                              {item.quote && (
                                <span className="text-xs text-slate-500 mt-1 italic border-l-2 border-slate-700 pl-2">
                                  "{item.quote}"
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transcript Section */}
              <div className="bg-slate-850 rounded-2xl border border-slate-700 p-8 shadow-2xl">
                <h3 className="text-xl font-serif text-white mb-6 border-b border-slate-800 pb-4">Interview Transcript</h3>
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {transcript.length === 0 ? (
                    <p className="text-slate-500 italic text-sm">No transcript data available.</p>
                  ) : (
                    transcript.map((t, idx) => (
                      <div key={idx} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed
                          ${t.role === 'user' 
                            ? 'bg-slate-800 text-slate-200 rounded-tr-none' 
                            : 'bg-slate-900 border border-slate-800 text-slate-400 rounded-tl-none'
                          }`}>
                          <div className="text-xs font-bold mb-1 opacity-50 uppercase tracking-wider">
                            {t.role === 'user' ? 'You' : interviewerName}
                          </div>
                          <div>
                            {renderHighlightedText(t.text)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* Configuration Selection */}
          {!isConnected && !isConnecting && !feedback && !isGeneratingFeedback && (
            <div className="w-full space-y-6">
              
              {/* Background Selection */}
              <div>
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3 pl-1">Select Your Background</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
                  {(Object.keys(CANDIDATE_BACKGROUNDS) as CandidateBackground[]).map((bgKey) => {
                    const bg = CANDIDATE_BACKGROUNDS[bgKey];
                    const isSelected = selectedBackground === bgKey;
                    return (
                      <button
                        key={bgKey}
                        onClick={() => setSelectedBackground(bgKey)}
                        className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all text-center
                           ${isSelected
                            ? 'bg-slate-800 border-blue-500/50 text-blue-100 ring-1 ring-blue-500/20 shadow-md'
                            : 'bg-slate-900/30 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-600'
                           }`}
                      >
                         <div className="mb-1">{bg.label}</div>
                         <div className={`text-[10px] font-normal leading-tight ${isSelected ? 'text-blue-300/80' : 'text-slate-500'}`}>
                           {bgKey === 'recent_grad' && "Academic Focus"}
                           {bgKey === 'experienced' && "Track Record"}
                           {bgKey === 'career_changer' && "Transferable Skills"}
                         </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Persona Selection & Customization */}
              <div>
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3 pl-1">Interviewer Settings</h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 w-full">
                  {/* Persona Cards */}
                  <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.values(PERSONAS).map((persona) => (
                      <button
                        key={persona.id}
                        onClick={() => handlePersonaChange(persona.id)}
                        className={`relative p-4 rounded-xl border text-left transition-all duration-200 group flex flex-col justify-between
                          ${selectedPersonaId === persona.id 
                            ? 'bg-slate-800 border-gold-500/50 ring-1 ring-gold-500/20' 
                            : 'bg-slate-900/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'
                          }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-sm font-semibold tracking-wide ${selectedPersonaId === persona.id ? 'text-white' : 'text-slate-300'}`}>
                              {persona.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed mb-3">
                            {persona.description}
                          </p>
                        </div>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full w-fit
                          ${selectedPersonaId === persona.id ? 'bg-gold-500/20 text-gold-400' : 'bg-slate-800 text-slate-500'}`}>
                          {persona.subLabel}
                        </span>
                        
                        {/* Selection Indicator */}
                        {selectedPersonaId === persona.id && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-gold-500 rounded-full border-2 border-slate-900"></div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Name & Voice Input */}
                  <div className="lg:col-span-1 bg-slate-900/30 border border-slate-700 rounded-xl p-4 flex flex-col justify-between gap-4">
                    <div>
                      <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 block">
                        Interviewer Name
                      </label>
                      <input 
                        type="text" 
                        value={interviewerName}
                        onChange={(e) => setInterviewerName(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 placeholder-slate-600"
                        placeholder="e.g. Sarah Jenkins"
                      />
                    </div>
                    
                    <div>
                      <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 block">
                        Interviewer Voice
                      </label>
                      <select
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                         className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20"
                      >
                        {AVAILABLE_VOICES.map((v) => (
                          <option key={v.name} value={v.name}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Controls */}
          <div className="flex flex-col items-center gap-4">
             {error && (
               <div className="text-red-400 text-sm bg-red-950/30 px-4 py-2 rounded-lg border border-red-900">
                 {error}
               </div>
             )}
             
             {!isConnected && !isGeneratingFeedback ? (
                <button
                  onClick={startInterview}
                  disabled={isConnecting}
                  className="group relative px-8 py-4 bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold rounded-full transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden w-full sm:w-auto"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {feedback ? (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Start New Interview
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Start Interview
                      </>
                    )}
                  </span>
                </button>
             ) : isConnected ? (
                <button
                  onClick={stopInterview}
                  className="px-8 py-4 bg-slate-800 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-400 text-slate-300 border border-slate-600 font-semibold rounded-full transition-all"
                >
                  End Session & Get Feedback
                </button>
             ) : null}
          </div>
          
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-slate-600 text-xs border-t border-slate-900/50 bg-slate-950">
        <p>DeepMetrics Analytics Recruitment AI • Powered by Gemini Live API</p>
      </footer>
    </div>
  );
};

export default App;