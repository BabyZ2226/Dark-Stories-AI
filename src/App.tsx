import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Icons from 'lucide-react';
import { 
  Ghost, 
  HelpCircle, 
  Send, 
  RotateCcw, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  PlusCircle,
  ChevronLeft,
  Skull,
  Mic,
  MicOff
} from 'lucide-react';
import { cn } from './lib/utils';
import { Case, Question, GameState, Difficulty, GameMode } from './types';
import { INITIAL_CASES, askQuestion, generateNewCase } from './services/geminiService';

const TIME_LIMITS: Record<Difficulty, number> = {
  'Fácil': 300,
  'Medio': 180,
  'Difícil': 120,
};

// Speech Recognition Type Definitions
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    currentCase: null,
    questions: [],
    isSolved: false,
    isLoading: false,
    gameMode: 'Relajado',
    timeLeft: null,
    isGameOver: false,
  });
  const [input, setInput] = useState('');
  const [showSolution, setShowSolution] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastVoiceAnswer, setLastVoiceAnswer] = useState<{text: string, answer: string} | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('Medio');
  const [selectedMode, setSelectedMode] = useState<GameMode>('Relajado');
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [gameState.questions]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'es-ES';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        const cleanedTranscript = transcript.trim();
        
        if (cleanedTranscript) {
          // We use a functional update or a ref-based approach to ensure we have the latest state
          // But for simplicity in this context, we'll trigger handleAsk with the transcript
          setInput(cleanedTranscript);
          
          // Auto-submit if it's a valid question
          setTimeout(() => {
            const submitBtn = document.getElementById('submit-question');
            if (submitBtn) submitBtn.click();
          }, 100);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') return; // Ignore no-speech to keep it alive
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        // If we want it to stay active, we restart it if isListening is still true
        if (isListening) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.error('Error restarting recognition:', e);
          }
        }
      };
    }
  }, [isListening]); // Re-bind onEnd when isListening changes

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error('Error starting recognition:', e);
      }
    }
  };

  // Load game state from local storage on initial mount
  useEffect(() => {
    const savedState = localStorage.getItem('dark_stories_game_state');
    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        setGameState(parsedState);
      } catch (error) {
        console.error('Error parsing saved game state:', error);
      }
    }
  }, []);

  // Save game state to local storage whenever it changes
  useEffect(() => {
    if (gameState.currentCase) {
      localStorage.setItem('dark_stories_game_state', JSON.stringify(gameState));
    } else {
      localStorage.removeItem('dark_stories_game_state');
    }
  }, [gameState]);

  // Timer logic
  useEffect(() => {
    let timer: any;
    if (gameState.currentCase && gameState.gameMode === 'Contrarreloj' && !gameState.isSolved && !gameState.isGameOver && gameState.timeLeft !== null) {
      timer = setInterval(() => {
        setGameState(prev => {
          if (prev.timeLeft !== null && prev.timeLeft > 0) {
            return { ...prev, timeLeft: prev.timeLeft - 1 };
          } else if (prev.timeLeft === 0) {
            clearInterval(timer);
            return { ...prev, isGameOver: true };
          }
          return prev;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState.currentCase, gameState.gameMode, gameState.isSolved, gameState.isGameOver, gameState.timeLeft]);

  const handleSelectCase = (selectedCase: Case) => {
    const difficulty = selectedCase.difficulty || 'Medio';
    setGameState({
      currentCase: selectedCase,
      questions: [],
      isSolved: false,
      isLoading: false,
      gameMode: selectedMode,
      timeLeft: selectedMode === 'Contrarreloj' ? TIME_LIMITS[difficulty] : null,
      isGameOver: false,
    });
    setShowSolution(false);
  };

  const CaseIcon = ({ name, className }: { name?: string, className?: string }) => {
    if (!name) return <Icons.FileQuestion className={className} />;
    const IconComponent = (Icons as any)[name];
    return IconComponent ? <IconComponent className={className} /> : <Icons.FileQuestion className={className} />;
  };

  const handleAsk = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !gameState.currentCase || gameState.isLoading) return;

    const userQuestion = input.trim();
    setInput('');
    
    setGameState(prev => ({ ...prev, isLoading: true }));

    const answer = await askQuestion(gameState.currentCase, userQuestion);

    const newQuestion: Question = {
      id: Math.random().toString(36).substr(2, 9),
      text: userQuestion,
      answer,
      timestamp: Date.now(),
    };

    if (isListening) {
      setLastVoiceAnswer({ text: userQuestion, answer });
      // Clear the epic display after a few seconds
      setTimeout(() => setLastVoiceAnswer(null), 4000);
    }

    setGameState(prev => ({
      ...prev,
      questions: [...prev.questions, newQuestion],
      isLoading: false,
    }));
  };

  const handleNewCase = async () => {
    setIsGenerating(true);
    const newCase = await generateNewCase(selectedDifficulty);
    handleSelectCase(newCase);
    setIsGenerating(false);
  };

  const resetGame = () => {
    setGameState({
      currentCase: null,
      questions: [],
      isSolved: false,
      isLoading: false,
      gameMode: 'Relajado',
      timeLeft: null,
      isGameOver: false,
    });
    setShowSolution(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!gameState.currentCase) {
    return (
      <div className="min-h-screen bg-[#0a0502] text-stone-200 font-sans selection:bg-orange-500/30 relative overflow-x-hidden">
        <div className="grainy" />
        
        {/* Atmospheric Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.2, 0.1],
              x: [0, 50, 0],
              y: [0, 30, 0]
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-900/20 blur-[120px]" 
          />
          <motion.div 
            animate={{ 
              scale: [1.2, 1, 1.2],
              opacity: [0.05, 0.15, 0.05],
              x: [0, -40, 0],
              y: [0, -20, 0]
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-red-900/10 blur-[120px]" 
          />
        </div>

        <main className="relative z-10 max-w-5xl mx-auto px-6 py-20 flex flex-col items-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center mb-16"
          >
            <motion.div 
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-orange-500/10 border border-orange-500/20 mb-8 shadow-[0_0_30px_rgba(249,115,22,0.1)]"
            >
              <Skull className="w-12 h-12 text-orange-500" />
            </motion.div>
            <h1 className="text-7xl font-light tracking-tighter mb-6 text-white">
              Dark <span className="text-orange-500 italic font-serif">Stories</span> AI
            </h1>
            <p className="text-stone-400 max-w-lg mx-auto text-xl leading-relaxed font-light">
              Desentraña misterios crípticos. Interroga a la IA. <br/>
              <span className="text-stone-500 text-sm font-mono uppercase tracking-widest mt-4 block">Solo respuestas de Sí o No</span>
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            {INITIAL_CASES.map((c, i) => (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -5, scale: 1.02 }}
                onClick={() => handleSelectCase(c)}
                className="group relative p-8 text-left glass-card rounded-3xl overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest">Caso Archivo #{i+1}</span>
                    </div>
                    <CaseIcon name={c.icon} className="w-4 h-4 text-stone-600 group-hover:text-orange-500/50 transition-colors" />
                  </div>
                  <h3 className="text-2xl font-medium mb-3 group-hover:text-orange-400 transition-colors leading-tight">{c.title}</h3>
                  <p className="text-stone-500 text-sm line-clamp-3 leading-relaxed font-light italic">
                    "{c.mystery}"
                  </p>
                  <div className="mt-6 flex items-center text-xs font-mono tracking-widest text-stone-600 uppercase group-hover:text-orange-500 transition-colors">
                    Investigar <ChevronLeft className="w-4 h-4 ml-1 rotate-180 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </motion.button>
            ))}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: INITIAL_CASES.length * 0.1 }}
              whileHover={{ scale: 1.02 }}
              className="group relative p-8 text-left glass-card rounded-3xl flex flex-col items-center justify-center text-center border-dashed border-orange-500/30 bg-orange-500/[0.02]"
            >
              <div className="flex flex-col gap-4 mb-8 w-full relative z-10">
                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-orange-500/60 font-bold">Nivel de Desafío</span>
                  <div className="flex gap-2 justify-center">
                    {(['Fácil', 'Medio', 'Difícil'] as Difficulty[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setSelectedDifficulty(d)}
                        className={cn(
                          "px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest transition-all duration-300",
                          selectedDifficulty === d 
                            ? "bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]" 
                            : "bg-stone-800/50 text-stone-500 hover:text-stone-300 border border-stone-700/50"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-orange-500/60 font-bold">Protocolo</span>
                  <div className="flex gap-2 justify-center">
                    {(['Relajado', 'Contrarreloj'] as GameMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setSelectedMode(m)}
                        className={cn(
                          "px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest transition-all duration-300",
                          selectedMode === m 
                            ? "bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]" 
                            : "bg-stone-800/50 text-stone-500 hover:text-stone-300 border border-stone-700/50"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <button
                onClick={handleNewCase}
                disabled={isGenerating}
                className="flex flex-col items-center group/btn relative z-10"
              >
                <div className="relative mb-4">
                  {isGenerating ? (
                    <RotateCcw className="w-10 h-10 text-orange-500 animate-spin" />
                  ) : (
                    <>
                      <PlusCircle className="w-10 h-10 text-orange-500 transition-transform group-hover/btn:scale-110" />
                      <motion.div 
                        animate={{ scale: [1, 1.4, 1], opacity: [0, 0.3, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 bg-orange-500 rounded-full blur-md"
                      />
                    </>
                  )}
                </div>
                <h3 className="text-2xl font-medium text-orange-400 group-hover/btn:text-orange-300 transition-colors">Nuevo Misterio</h3>
                <p className="text-stone-500 text-xs mt-2 font-mono uppercase tracking-widest">
                  {selectedMode === 'Contrarreloj' ? `Límite: ${TIME_LIMITS[selectedDifficulty] / 60} minutos` : `Generación Aleatoria`}
                </p>
              </button>
            </motion.div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0502] text-stone-200 font-sans selection:bg-orange-500/30 flex flex-col relative overflow-hidden">
      <div className="grainy" />
      
      {/* Header */}
      <header className="relative z-20 border-b border-stone-800/50 bg-[#0a0502]/80 backdrop-blur-xl px-6 py-4 flex items-center justify-between shadow-2xl">
        <motion.button 
          whileHover={{ x: -5 }}
          onClick={resetGame}
          className="flex items-center text-stone-400 hover:text-white transition-colors text-xs uppercase tracking-[0.2em]"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Volver
        </motion.button>
        <div className="flex items-center gap-4">
          {gameState.gameMode === 'Contrarreloj' && gameState.timeLeft !== null && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full border font-mono text-sm shadow-lg",
                gameState.timeLeft <= 30 ? "bg-red-500/20 border-red-500 text-red-500 animate-pulse" : "bg-stone-900/50 border-stone-700 text-stone-300"
              )}
            >
              <RotateCcw className={cn("w-3.5 h-3.5", gameState.timeLeft <= 30 && "animate-spin")} />
              {formatTime(gameState.timeLeft)}
            </motion.div>
          )}
          <div className="flex items-center gap-3 px-4 py-1.5 bg-stone-900/50 border border-stone-800 rounded-full">
            <CaseIcon name={gameState.currentCase.icon} className="w-4 h-4 text-orange-500" />
            <span className="font-medium tracking-tight text-sm text-stone-300">{gameState.currentCase.title}</span>
          </div>
        </div>
        <div className="w-20 hidden md:block" /> {/* Spacer */}
      </header>

      <main className="flex-1 relative z-10 max-w-5xl mx-auto w-full px-6 py-8 flex flex-col md:flex-row gap-8 overflow-hidden">
        {/* Left Side: Mystery & Solution */}
        <div className="w-full md:w-1/2 flex flex-col gap-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-8 bg-stone-900/40 border border-stone-800 rounded-3xl backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 text-orange-500 mb-4">
              <HelpCircle className="w-5 h-5" />
              <span className="text-xs font-mono uppercase tracking-[0.2em]">El Misterio</span>
            </div>
            <p className="text-xl leading-relaxed text-white font-light italic">
              "{gameState.currentCase.mystery}"
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className={cn(
              "p-8 rounded-3xl transition-all duration-500 border",
              showSolution 
                ? "bg-orange-500/10 border-orange-500/30" 
                : "bg-stone-900/20 border-stone-800/50"
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-stone-500">
                <Eye className="w-5 h-5" />
                <span className="text-xs font-mono uppercase tracking-[0.2em]">La Solución</span>
              </div>
              <button 
                onClick={() => setShowSolution(!showSolution)}
                className="text-xs font-mono uppercase tracking-widest text-orange-500 hover:text-orange-400 transition-colors flex items-center gap-1"
              >
                {showSolution ? <><EyeOff className="w-3 h-3" /> Ocultar</> : <><Eye className="w-3 h-3" /> Revelar</>}
              </button>
            </div>
            
            <AnimatePresence mode="wait">
              {showSolution ? (
                <motion.p 
                  key="solution"
                  initial={{ opacity: 0, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(10px)' }}
                  className="text-lg leading-relaxed text-orange-200"
                >
                  {gameState.currentCase.solution}
                </motion.p>
              ) : (
                <motion.div 
                  key="hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-20 flex items-center justify-center border border-dashed border-stone-800 rounded-xl text-stone-600 text-sm italic"
                >
                  La solución está oculta...
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Right Side: Chat */}
        <div className="w-full md:w-1/2 flex flex-col bg-stone-900/20 border border-stone-800/50 rounded-3xl backdrop-blur-sm overflow-hidden">
          <div className="p-4 border-b border-stone-800/50 bg-stone-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-widest text-stone-500">Interrogatorio</span>
              {gameState.isLoading && (
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-1.5 h-1.5 rounded-full bg-orange-500"
                />
              )}
            </div>
            <span className="text-[10px] bg-stone-800 px-2 py-1 rounded text-stone-400">{gameState.questions.length} preguntas</span>
          </div>

          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
            style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)' }}
          >
            {gameState.questions.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                <Ghost className="w-12 h-12 mb-4" />
                <p className="text-sm italic">Haz tu primera pregunta para empezar a investigar...</p>
              </div>
            )}
            
            <AnimatePresence initial={false}>
              {gameState.questions.map((q, i) => (
                <motion.div 
                  key={q.id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 260, 
                    damping: 20,
                    delay: i === gameState.questions.length - 1 ? 0.1 : 0 
                  }}
                  className="space-y-2"
                >
                  <div className="flex justify-end">
                    <div className="bg-stone-800 text-stone-200 px-4 py-2 rounded-2xl rounded-tr-none max-w-[80%] text-sm shadow-lg">
                      {q.text}
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: i === gameState.questions.length - 1 ? 0.4 : 0 }}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-2xl rounded-tl-none text-sm font-medium border shadow-sm",
                        q.answer === 'SÍ' && "bg-green-500/10 text-green-400 border-green-500/20",
                        q.answer === 'NO' && "bg-red-500/10 text-red-400 border-red-500/20",
                        q.answer === 'IRRELEVANTE' && "bg-stone-500/10 text-stone-400 border-stone-500/20",
                        q.answer === 'NO PUEDO RESPONDER' && "bg-orange-500/10 text-orange-400 border-orange-500/20"
                      )}
                    >
                      <motion.div
                        initial={{ rotate: -20 }}
                        animate={{ rotate: 0 }}
                        transition={{ delay: i === gameState.questions.length - 1 ? 0.5 : 0 }}
                      >
                        {q.answer === 'SÍ' && <CheckCircle2 className="w-4 h-4" />}
                        {q.answer === 'NO' && <XCircle className="w-4 h-4" />}
                        {q.answer === 'IRRELEVANTE' && <AlertCircle className="w-4 h-4" />}
                        {q.answer === 'NO PUEDO RESPONDER' && <HelpCircle className="w-4 h-4" />}
                      </motion.div>
                      {q.answer}
                    </motion.div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {gameState.isLoading && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex justify-start"
              >
                <div className="bg-stone-900/50 border border-stone-800 px-5 py-3 rounded-2xl rounded-tl-none flex gap-1.5 items-center">
                  <motion.span 
                    animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                    className="w-1.5 h-1.5 bg-orange-500 rounded-full" 
                  />
                  <motion.span 
                    animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    className="w-1.5 h-1.5 bg-orange-500 rounded-full" 
                  />
                  <motion.span 
                    animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    className="w-1.5 h-1.5 bg-orange-500 rounded-full" 
                  />
                  <span className="ml-2 text-[10px] font-mono text-stone-500 uppercase tracking-widest animate-pulse">Pensando</span>
                </div>
              </motion.div>
            )}
          </div>

          <form 
            onSubmit={handleAsk}
            className="p-4 bg-stone-900/40 border-t border-stone-800/50 flex gap-2"
          >
            <div className="flex-1 relative flex items-center">
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={gameState.isGameOver ? "¡Tiempo agotado!" : isListening ? "Escuchando..." : "¿La lluvia es importante?"}
                className={cn(
                  "w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-2 pr-10 text-sm focus:outline-none focus:border-orange-500/50 transition-colors placeholder:text-stone-700",
                  isListening && "border-orange-500/50 ring-1 ring-orange-500/20",
                  gameState.isGameOver && "border-red-500/50 opacity-50"
                )}
                disabled={gameState.isLoading || gameState.isGameOver}
              />
              <button
                type="button"
                onClick={toggleListening}
                disabled={gameState.isGameOver}
                className={cn(
                  "absolute right-2 p-1.5 rounded-lg transition-all duration-500",
                  isListening 
                    ? "text-white bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]" 
                    : "text-stone-600 hover:text-stone-400",
                  gameState.isGameOver && "hidden"
                )}
                title="Modo manos libres"
              >
                {isListening ? (
                  <div className="relative">
                    <MicOff className="w-4 h-4 relative z-10" />
                    <motion.div 
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 bg-white rounded-full"
                    />
                  </div>
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            </div>
            <button 
              id="submit-question"
              type="submit"
              disabled={!input.trim() || gameState.isLoading || gameState.isGameOver}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-orange-500 text-white p-2 rounded-xl transition-all active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-20 p-6 text-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-stone-600">
          Powered by Gemini AI • Dark Stories AI v1.0
        </p>
      </footer>

      {/* Epic Voice Overlay */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0502]/90 backdrop-blur-2xl"
          >
            <div className="grainy opacity-10" />
            
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.2, opacity: 0 }}
              className="relative mb-12"
            >
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.2, 0.5, 0.2]
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-orange-500 rounded-full blur-3xl"
              />
              <div className="relative z-10 w-32 h-32 rounded-full bg-orange-500 flex items-center justify-center shadow-[0_0_50px_rgba(249,115,22,0.5)]">
                <Mic className="w-16 h-16 text-white" />
              </div>
              
              {/* Pulse Rings */}
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 2.5, opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
                  className="absolute inset-0 border-2 border-orange-500 rounded-full"
                />
              ))}
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center max-w-2xl px-6"
            >
              <h2 className="text-orange-500 font-mono text-xs uppercase tracking-[0.5em] mb-4 animate-pulse">
                Escuchando tu pregunta...
              </h2>
              <p className="text-3xl text-white font-light italic leading-tight">
                {input || "Habla ahora..."}
              </p>
            </motion.div>

            <AnimatePresence>
              {lastVoiceAnswer && (
                <motion.div
                  initial={{ y: 50, opacity: 0, scale: 0.9 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: -50, opacity: 0, scale: 1.1 }}
                  className="mt-16 flex flex-col items-center"
                >
                  <div className="text-stone-500 font-mono text-[10px] uppercase tracking-widest mb-4">
                    Respuesta del Guardián
                  </div>
                  <div className={cn(
                    "text-8xl font-black tracking-tighter px-12 py-6 rounded-3xl border-4 shadow-2xl",
                    lastVoiceAnswer.answer === 'SÍ' && "bg-green-500/10 text-green-500 border-green-500/30 shadow-green-500/20",
                    lastVoiceAnswer.answer === 'NO' && "bg-red-500/10 text-red-500 border-red-500/30 shadow-red-500/20",
                    lastVoiceAnswer.answer === 'IRRELEVANTE' && "bg-stone-500/10 text-stone-400 border-stone-500/30 shadow-stone-500/20",
                    lastVoiceAnswer.answer === 'NO PUEDO RESPONDER' && "bg-orange-500/10 text-orange-400 border-orange-500/30 shadow-orange-500/20"
                  )}>
                    {lastVoiceAnswer.answer}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={toggleListening}
              className="absolute bottom-12 px-8 py-3 rounded-full bg-stone-900 border border-stone-800 text-stone-400 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest"
            >
              Finalizar Sesión de Voz
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
