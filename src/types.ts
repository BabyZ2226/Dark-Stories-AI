export type Difficulty = 'Fácil' | 'Medio' | 'Difícil';
export type GameMode = 'Relajado' | 'Contrarreloj';

export interface Case {
  id: string;
  title: string;
  mystery: string;
  solution: string;
  difficulty?: Difficulty;
  icon?: string;
}

export interface Question {
  id: string;
  text: string;
  answer: 'SÍ' | 'NO' | 'IRRELEVANTE' | 'NO PUEDO RESPONDER';
  timestamp: number;
}

export interface GameState {
  currentCase: Case | null;
  questions: Question[];
  isSolved: boolean;
  isLoading: boolean;
  gameMode: GameMode;
  timeLeft: number | null;
  isGameOver: boolean;
}
