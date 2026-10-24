import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Clock, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft, 
  Flag, 
  Send,
  HelpCircle,
  EyeOff,
  Maximize,
  Sparkles,
  Award,
  Wifi,
  WifiOff,
  CloudCheck,
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Question, Exam } from '../../types';
import { MathRenderer } from '../common/MathRenderer';
import { apiClient } from '../../lib/apiClient';

interface ExamTestingEngineProps {
  examId: string;
  studentId: string;
  studentName: string;
  onExamCompleted: (result: any) => void;
  onExit: () => void;
}

export const ExamTestingEngine: React.FC<ExamTestingEngineProps> = ({
  examId,
  studentId,
  studentName,
  onExamCompleted,
  onExit,
}) => {
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>({});
  
  // Timer State
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Network & Autosave Resilience State
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isAutosaving, setIsAutosaving] = useState(false);

  // Anti-Cheating System: Window Blur & Tab Switch Detector
  const [violationCount, setViolationCount] = useState<number>(0);
  const [blurTimestamps, setBlurTimestamps] = useState<string[]>([]);
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningLevel, setWarningLevel] = useState<number>(0);

  // Loading & Submission State
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs for safe async & event coordination
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const hasAutoSubmittedRef = useRef(false);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

  // Persistent Idempotency Key & Offline Resilient Storage per exam attempt
  const storageKey = `nexus_exam_answers_${examId}`;
  const localStorageKey = `nexus_exam_answers_${examId}_${studentId}`;
  const idempKeyStorage = `nexus_exam_idemp_${examId}`;
  const idempotencyKeyRef = useRef<string>((() => {
    try {
      const stored = sessionStorage.getItem(idempKeyStorage);
      if (stored) return stored;
      const generated = `subm_${examId}_${studentId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      sessionStorage.setItem(idempKeyStorage, generated);
      return generated;
    } catch {
      return `subm_${examId}_${studentId}_${Date.now()}`;
    }
  })());

  // Enter Fullscreen Helper
  const enterFullscreen = useCallback(async () => {
    try {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        await docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
      setIsFullscreen(true);
    } catch (err) {
      console.warn('[ExamTestingEngine] Fullscreen request not granted automatically:', err);
    }
  }, []);

  // Sync answers to server endpoint (PUT /api/exams/:id/attempt/answers)
  const syncAnswersToServer = useCallback(async (currentAnswers: Record<string, any>) => {
    if (!navigator.onLine || hasAutoSubmittedRef.current) return;
    try {
      setIsAutosaving(true);
      const res = await apiClient.put(`/api/exams/${examId}/attempt/answers`, {
        answers: currentAnswers,
      });
      if (res.ok) {
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch (err) {
      console.warn('[Autosave] Transient sync failure, answers remain safely cached in localStorage:', err);
    } finally {
      setIsAutosaving(false);
    }
  }, [examId]);

  // Track Online / Offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Immediately push locally autosaved answers to server on reconnection
      syncAnswersToServer(answersRef.current);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [examId, syncAnswersToServer]);

  // 15-second Periodic Server Autosave Interval
  useEffect(() => {
    if (!isTimerRunning || loading || hasAutoSubmittedRef.current) return;

    const interval = setInterval(() => {
      syncAnswersToServer(answersRef.current);
    }, 15000);

    return () => clearInterval(interval);
  }, [isTimerRunning, loading, syncAnswersToServer]);

  // Fetch sanitized exam questions & resume prior session state
  useEffect(() => {
    const fetchExamData = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const res = await apiClient.get(`/api/exams/${examId}/take`);

        if (!res.ok) {
          const errData = res.data || {};
          setErrorMessage(errData.error || 'Unable to access examination.');
          return;
        }

        const data = res.data;
        setExam(data.exam);
        setQuestions(data.exam.questions || []);

        // Restore Answers: Combine server savedAnswers, localStorage, and sessionStorage
        let localAnswers: Record<string, any> = {};
        try {
          const storedLocal = localStorage.getItem(localStorageKey);
          if (storedLocal) localAnswers = JSON.parse(storedLocal);
          const storedSession = sessionStorage.getItem(storageKey);
          if (storedSession) localAnswers = { ...localAnswers, ...JSON.parse(storedSession) };
        } catch (e) {
          // Ignore
        }

        const serverAnswers = data.attempt?.savedAnswers || {};
        const mergedAnswers = { ...serverAnswers, ...localAnswers };
        setAnswers(mergedAnswers);
        answersRef.current = mergedAnswers;

        // Resume remaining time based on server's authoritative timer
        if (data.attempt && typeof data.attempt.remainingSeconds === 'number') {
          setTimeLeftSeconds(data.attempt.remainingSeconds);
        } else {
          setTimeLeftSeconds((data.exam.durationMinutes || 30) * 60);
        }

        setIsTimerRunning(true);
        // Prompt fullscreen entry on exam initialization
        setTimeout(() => {
          enterFullscreen();
        }, 150);
      } catch (err: any) {
        console.error('Failed to load exam:', err);
        setErrorMessage(err.message || 'Network connection failed while opening exam.');
      } finally {
        setLoading(false);
      }
    };

    fetchExamData();
  }, [examId, studentId, storageKey, localStorageKey, enterFullscreen]);

  // Live Countdown Timer
  useEffect(() => {
    if (!isTimerRunning || timeLeftSeconds <= 0) return;

    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleForceAutoSubmit('Time Expired! Examination automatically submitted.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isTimerRunning, timeLeftSeconds]);

  // Format Timer mm:ss
  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Safe Submit Logic with Idempotency Key & Offline Resilience
  const handleForceAutoSubmit = useCallback(async (reason?: string) => {
    if (hasAutoSubmittedRef.current) return;
    hasAutoSubmittedRef.current = true;
    setIsTimerRunning(false);
    setIsSubmitting(true);

    try {
      const cheatingLog = {
        violationCount: violationCount >= 3 ? violationCount : violationCount,
        cheatingFlagged: violationCount >= 3,
        blurTimestamps,
        reason: reason || (violationCount >= 3 ? 'Exceeded allowed focus blur strikes' : 'Standard submission'),
      };

      const key = typeof idempotencyKeyRef.current === 'function' ? (idempotencyKeyRef.current as any)() : idempotencyKeyRef.current;

      const res = await apiClient.post(
        `/api/exams/${examId}/submit`,
        { answers: answersRef.current, cheatingLog },
        { idempotencyKey: key }
      );

      const data = res.data;
      setSubmissionResult(data.result);

      // Clean up session and local storage after confirmed submission
      try {
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem(idempKeyStorage);
        localStorage.removeItem(localStorageKey);
      } catch (e) {
        // Ignore
      }

      if (data.result.passed && !data.result.cheatingFlagged) {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#10b981', '#fbbf24', '#ffffff'],
        });
      }
    } catch (err: any) {
      console.error('Submission failed:', err);
      // Persist answers safely in local storage so no student work is lost
      try {
        localStorage.setItem(localStorageKey, JSON.stringify(answersRef.current));
      } catch (e) {
        // Ignore
      }
      setErrorMessage(
        navigator.onLine
          ? (err.message || 'Submission could not be recorded. Please retry.')
          : 'You are currently offline. All your answers are safely preserved locally. When internet returns, submission will complete automatically.'
      );
      hasAutoSubmittedRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  }, [examId, violationCount, blurTimestamps, storageKey, idempKeyStorage, localStorageKey]);

  // Centralized Focus Loss / Anti-Cheating Handler
  const handleFocusLoss = useCallback((reason?: string) => {
    if (hasAutoSubmittedRef.current) return;

    const nowIso = new Date().toISOString();
    const nextCount = violationCount + 1;
    setViolationCount(nextCount);
    setBlurTimestamps((prev) => [...prev, nowIso]);

    if (nextCount === 1) {
      setWarningLevel(1);
      setWarningModalOpen(true);
    } else if (nextCount === 2) {
      setWarningLevel(2);
      setWarningModalOpen(true);
    } else if (nextCount >= 3) {
      setWarningLevel(3);
      setWarningModalOpen(true);
      handleForceAutoSubmit(reason || 'Academic Malpractice: 3 window blur / fullscreen violations detected. Exam auto-submitted.');
    }
  }, [violationCount, handleForceAutoSubmit]);

  // Anti-Cheating Event Listeners (Window Blur, Visibility Change, Fullscreen Change)
  useEffect(() => {
    if (loading || isSubmitting || submissionResult) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleFocusLoss('Navigated away or minimized examination tab.');
      }
    };

    const handleWindowBlur = () => {
      handleFocusLoss('Lost active browser window focus.');
    };

    const handleFullscreenChange = () => {
      const isNowFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isNowFullscreen);

      // If user exited fullscreen during active examination
      if (!isNowFullscreen && !hasAutoSubmittedRef.current) {
        handleFocusLoss('Exited fullscreen lock during active examination.');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [loading, isSubmitting, submissionResult, handleFocusLoss]);

  // Security Lockout: Block Right Click, Copy, Paste, Cut, and Inspection Shortcuts
  useEffect(() => {
    if (loading || isSubmitting || submissionResult) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    const handleClipboardEvent = (e: ClipboardEvent) => {
      e.preventDefault();
      return false;
    };

    const handleSecurityKeyDown = (e: KeyboardEvent) => {
      // Block F12 (DevTools)
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Block PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      const isModifier = e.ctrlKey || e.metaKey;
      const lowerKey = e.key.toLowerCase();
      if (isModifier) {
        // Block Ctrl/Cmd + Shift + I/J/C (DevTools)
        if (e.shiftKey && ['i', 'j', 'c'].includes(lowerKey)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        // Block Ctrl/Cmd + C, V, X, P, U, S (Copy, Paste, Cut, Print, View Source, Save)
        if (['c', 'v', 'x', 'p', 'u', 's'].includes(lowerKey)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('copy', handleClipboardEvent);
    window.addEventListener('paste', handleClipboardEvent);
    window.addEventListener('cut', handleClipboardEvent);
    window.addEventListener('keydown', handleSecurityKeyDown, true);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('copy', handleClipboardEvent);
      window.removeEventListener('paste', handleClipboardEvent);
      window.removeEventListener('cut', handleClipboardEvent);
      window.removeEventListener('keydown', handleSecurityKeyDown, true);
    };
  }, [loading, isSubmitting, submissionResult]);

  // Modal accessibility: Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmSubmitOpen) {
          setConfirmSubmitOpen(false);
          triggerButtonRef.current?.focus();
        }
        if (warningModalOpen && warningLevel < 3) {
          setWarningModalOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmSubmitOpen, warningModalOpen, warningLevel]);

  const handleManualSubmit = () => {
    setConfirmSubmitOpen(false);
    handleForceAutoSubmit('Completed and submitted voluntarily.');
  };

  // Select Option Helper with immediate local & debounced server autosave
  const handleSelectOption = (questionId: string, optId: string, type: string) => {
    let updatedAnswers: Record<string, any>;
    if (type === 'multi') {
      const currentList: string[] = Array.isArray(answers[questionId]) ? answers[questionId] : [];
      const updated = currentList.includes(optId)
        ? currentList.filter((id) => id !== optId)
        : [...currentList, optId];
      updatedAnswers = { ...answers, [questionId]: updated };
    } else {
      updatedAnswers = { ...answers, [questionId]: optId };
    }

    setAnswers(updatedAnswers);
    answersRef.current = updatedAnswers;

    // 1. Immediate dual persistence to sessionStorage & localStorage
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(updatedAnswers));
      localStorage.setItem(localStorageKey, JSON.stringify(updatedAnswers));
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) {
      // Ignore
    }

    // 2. Debounced push to server endpoint
    syncAnswersToServer(updatedAnswers);
  };

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-700 dark:text-slate-300">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide">Initializing Secure Examination Environment...</p>
        <p className="text-xs text-slate-500 mt-1">Restoring prior progress &amp; enforcing Anti-Cheating Detectors</p>
        <span className="sr-only">Loading exam questions, please wait...</span>
      </div>
    );
  }

  if (errorMessage && !exam) {
    return (
      <div role="alert" className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-3xl p-8 shadow-xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold font-serif text-slate-900 dark:text-slate-100">Examination Notice</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{errorMessage}</p>
          <button
            type="button"
            onClick={onExit}
            className="w-full py-3 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-semibold text-sm hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Final Results Screen
  if (submissionResult) {
    return (
      <div role="region" aria-label="Exam Results" className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 flex items-center justify-center">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 text-center space-y-6 shadow-sm dark:shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-150">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600" />
          
          {submissionResult.cheatingFlagged ? (
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/20">
              <ShieldAlert className="w-9 h-9 stroke-[2]" aria-hidden="true" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/30">
              <Award className="w-9 h-9 stroke-[2.2]" aria-hidden="true" />
            </div>
          )}

          <div>
            <div className="flex items-center justify-center gap-1.5 mb-2">
              {submissionResult.passed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
              )}
              <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
                submissionResult.cheatingFlagged
                  ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                  : submissionResult.passed
                  ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-500/30'
              }`}>
                {submissionResult.cheatingFlagged 
                  ? 'Malpractice Detected & Logged'
                  : submissionResult.passed
                  ? 'Passed Examination'
                  : 'Needs Improvement'}
              </span>
            </div>

            <h2 className="text-2xl font-serif font-bold text-slate-900 dark:text-slate-100">
              {exam?.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Examination successfully graded by Nexus Institutional Engine
            </p>
          </div>

          {/* Marks & Score Breakdown */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-center">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Score</p>
              <p className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {submissionResult.score} / {submissionResult.totalMarks}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Percentage</p>
              <p className={`text-xl font-bold font-mono ${submissionResult.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {submissionResult.percentage}%
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Points Awarded</p>
              <p className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                +{submissionResult.bonusPointsAwarded || submissionResult.percentage}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => onExamCompleted(submissionResult)}
              className="w-full py-3.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 font-bold text-sm rounded-xl hover:opacity-90 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              Back to My Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).length;
  const isTimeCritical = timeLeftSeconds < 300; // Under 5 minutes

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col select-none selection:bg-none">
      
      {/* Fullscreen Lockout Banner */}
      {!isFullscreen && (
        <div className="bg-amber-600 text-white font-bold text-xs px-4 py-2 flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-2">
            <Maximize className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Fullscreen Mode is mandatory for examination integrity.</span>
          </div>
          <button
            type="button"
            onClick={enterFullscreen}
            className="px-3 py-1 bg-white text-amber-900 rounded font-bold text-xs hover:bg-amber-50 cursor-pointer shadow transition-colors"
          >
            Enter Fullscreen
          </button>
        </div>
      )}

      {/* Offline Status Persistent Banner */}
      {!isOnline && (
        <div
          role="status"
          aria-live="assertive"
          className="bg-amber-500 text-slate-950 font-bold text-xs px-4 py-2 flex items-center justify-center gap-2 shadow-md shrink-0"
        >
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Offline – answers saved locally. They will automatically synchronize when reconnected.</span>
        </div>
      )}

      {/* Screen Reader Live Region for Time Warnings */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {timeLeftSeconds % 60 === 0 && `Time remaining: ${formatTimer(timeLeftSeconds)}`}
      </div>
      {isTimeCritical && (
        <div aria-live="assertive" aria-atomic="true" className="sr-only">
          Warning: Only {formatTimer(timeLeftSeconds)} remaining before examination paper automatically submits.
        </div>
      )}

      {/* Top Examination HUD Header */}
      <header className="sticky top-0 z-40 w-full max-w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-8 py-2 sm:py-3.5 flex items-center justify-between gap-1.5 sm:gap-4 shadow-sm dark:shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <h1 className="font-serif font-bold text-xs sm:text-base text-slate-900 dark:text-slate-100 truncate flex-1 min-w-0">
                {exam?.title}
              </h1>
              <span className="hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                {exam?.subjectName}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
              <span>Candidate: <strong className="text-slate-800 dark:text-slate-200">{studentName}</strong></span>
              {!isOnline ? (
                <span className="text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center gap-1">
                  <WifiOff className="w-3 h-3 inline" aria-hidden="true" />
                  Offline – answers saved locally
                </span>
              ) : isAutosaving ? (
                <span className="text-blue-600 dark:text-blue-400 font-semibold inline-flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 inline animate-spin" aria-hidden="true" />
                  Syncing…
                </span>
              ) : lastSavedTime ? (
                <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                  <CloudCheck className="w-3 h-3 inline" aria-hidden="true" />
                  Saved {lastSavedTime}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Live Countdown Timer & Submit */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div
            role="timer"
            aria-label={`Time remaining: ${formatTimer(timeLeftSeconds)}`}
            className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3.5 py-1.5 min-h-[38px] sm:min-h-[44px] rounded-xl border font-mono font-bold text-xs sm:text-base shadow-inner transition-colors ${
              isTimeCritical 
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-700 dark:text-rose-300 animate-pulse'
                : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-amber-700 dark:text-amber-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
            <span>{formatTimer(timeLeftSeconds)}</span>
          </div>

          <button
            ref={triggerButtonRef}
            type="button"
            disabled={isSubmitting}
            onClick={() => setConfirmSubmitOpen(true)}
            aria-label="Submit Examination Paper"
            className="flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-[38px] sm:min-h-[44px] bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shrink-0"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Finish & Submit</span>
            <span className="sm:hidden">Submit</span>
          </button>
        </div>
      </header>

      {/* Main Testing Stage */}
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        
        {/* Left 3 Cols: Active Question Display */}
        <div className="lg:col-span-3 space-y-4 sm:space-y-6">
          {/* Mobile Quick Question Palette Ribbon */}
          <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-1 px-0.5" role="tablist" aria-label="Question Navigation">
            {questions.map((q, idx) => {
              const isAnswered = answers[q.id] !== undefined;
              const isCurrent = idx === currentIndex;
              const isFlagged = !!flaggedQuestions[q.id];
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Question ${idx + 1}: ${isAnswered ? 'Answered' : 'Unanswered'}${isFlagged ? ', Flagged for review' : ''}`}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={`w-11 h-11 min-w-[44px] min-h-[44px] shrink-0 rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 relative ${
                    isCurrent
                      ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400'
                      : isAnswered
                      ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/40'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {idx + 1}
                  {isFlagged && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          {currentQ ? (
            <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-8 shadow-sm dark:shadow-2xl space-y-5 sm:space-y-6 relative overflow-hidden">
              
              {/* Question Banner & Navigation */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono font-bold text-sm flex items-center justify-center border border-amber-500/30" aria-hidden="true">
                    {currentIndex + 1}
                  </span>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Question {currentIndex + 1} of {totalQuestions}
                    </h2>
                    <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 font-semibold">
                      ({currentQ.points} Marks)
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  aria-pressed={!!flaggedQuestions[currentQ.id]}
                  onClick={() => setFlaggedQuestions({ ...flaggedQuestions, [currentQ.id]: !flaggedQuestions[currentQ.id] })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    flaggedQuestions[currentQ.id]
                      ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{flaggedQuestions[currentQ.id] ? 'Flagged for Review' : 'Mark for Review'}</span>
                </button>
              </div>

              {/* Question Text */}
              <div className="text-base sm:text-lg font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                <MathRenderer content={currentQ.text} />
              </div>

              {/* Attached Photograph (if any) */}
              {currentQ.imageUrl && (
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-2 max-w-lg">
                  <img
                    src={currentQ.imageUrl}
                    alt="Question visual reference"
                    className="w-full h-56 sm:h-72 object-cover rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                  <p className="text-[10px] text-slate-500 text-center mt-1.5">
                    Problem illustration reference
                  </p>
                </div>
              )}

              {/* Real Accessible Radio / Checkbox Options Selector */}
              <fieldset className="space-y-3 pt-2">
                <legend className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  {currentQ.type === 'multi' ? 'Select all applicable statements:' : 'Choose the correct answer:'}
                </legend>

                <div className="space-y-2.5" role={currentQ.type === 'multi' ? 'group' : 'radiogroup'}>
                  {currentQ.options.map((opt, oIdx) => {
                    const isSelected = currentQ.type === 'multi'
                      ? Array.isArray(answers[currentQ.id]) && answers[currentQ.id].includes(opt.id)
                      : answers[currentQ.id] === opt.id;

                    const inputId = `opt-${currentQ.id}-${opt.id}`;

                    return (
                      <label
                        key={opt.id}
                        htmlFor={inputId}
                        className={`w-full text-left p-4 rounded-2xl border text-xs sm:text-sm font-medium transition-all flex items-center gap-3 cursor-pointer focus-within:ring-2 focus-within:ring-amber-500 ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-950 dark:text-amber-200 shadow-md shadow-amber-500/10'
                            : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <input
                          id={inputId}
                          type={currentQ.type === 'multi' ? 'checkbox' : 'radio'}
                          name={`question-${currentQ.id}`}
                          value={opt.id}
                          checked={isSelected}
                          onChange={() => handleSelectOption(currentQ.id, opt.id, currentQ.type)}
                          className="w-4 h-4 text-amber-600 focus:ring-amber-500 rounded border-slate-300 cursor-pointer shrink-0"
                          aria-label={`Option ${String.fromCharCode(65 + oIdx)}: ${opt.text}`}
                        />
                        <span className={`w-6 h-6 rounded-lg font-mono text-xs flex items-center justify-center font-bold border transition-colors shrink-0 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-200 dark:bg-slate-900 text-slate-700 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                        }`} aria-hidden="true">
                          {String.fromCharCode(65 + oIdx)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <MathRenderer content={opt.text} inline />
                        </div>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* Navigation Arrows */}
              <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-800 gap-3">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-semibold rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Previous</span>
                </button>

                <div className="text-xs font-mono text-slate-400">
                  {currentIndex + 1} / {totalQuestions}
                </div>

                <button
                  type="button"
                  disabled={currentIndex === totalQuestions - 1}
                  onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <span>Next Question</span>
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-400">
              No examination questions found.
            </div>
          )}
        </div>

        {/* Right 1 Col: Desktop Palette Grid */}
        <div className="hidden lg:block space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-serif font-bold text-sm text-slate-900 dark:text-slate-100">
                Question Palette
              </h3>
              <span className="text-xs font-mono text-slate-500">
                {answeredCount}/{totalQuestions} Done
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2 max-h-[380px] overflow-y-auto pr-1" role="tablist" aria-label="Question Navigator">
              {questions.map((q, idx) => {
                const isAnswered = answers[q.id] !== undefined;
                const isCurrent = idx === currentIndex;
                const isFlagged = !!flaggedQuestions[q.id];

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    aria-label={`Question ${idx + 1}: ${isAnswered ? 'Answered' : 'Unanswered'}${isFlagged ? ', Flagged' : ''}`}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={`h-10 min-w-[40px] rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 relative ${
                      isCurrent
                        ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400 shadow-md'
                        : isAnswered
                        ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {idx + 1}
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend (WCAG: Never use color alone) */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 text-[10px] text-slate-500 dark:text-slate-400 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded border border-slate-400 inline-block" aria-hidden="true" />
                <span>Unanswered ({totalQuestions - answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <Flag className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                <span>Flagged for Review ({Object.values(flaggedQuestions).filter(Boolean).length})</span>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* Confirmation Modal Before Voluntary Submit */}
      {confirmSubmitOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-submit-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-center pb-safe animate-in slide-in-from-bottom duration-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
              <Send className="w-6 h-6" aria-hidden="true" />
            </div>

            <h3 id="confirm-submit-title" className="font-serif font-bold text-lg text-slate-900 dark:text-slate-100">
              Submit Examination Paper?
            </h3>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              You have answered <strong className="text-amber-600 dark:text-amber-400 font-mono">{answeredCount}</strong> of <strong className="text-slate-900 dark:text-slate-200 font-mono">{totalQuestions}</strong> questions. Once submitted, your answers cannot be altered.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmSubmitOpen(false);
                  triggerButtonRef.current?.focus();
                }}
                className="flex-1 py-3 min-h-[44px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Continue Test
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleManualSubmit}
                className="flex-1 py-3 min-h-[44px] bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {isSubmitting ? 'Submitting...' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* On-Screen Anti-Cheating Warning Modals */}
      {warningModalOpen && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="warning-modal-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-rose-950/90 backdrop-blur-md animate-in fade-in duration-150"
        >
          <div className="bg-white dark:bg-slate-900 border-t-2 sm:border-2 border-rose-500 rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-8 space-y-4 sm:space-y-5 shadow-2xl text-center pb-safe animate-in slide-in-from-bottom duration-200">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto animate-bounce">
              <ShieldAlert className="w-8 h-8 sm:w-9 sm:h-9 stroke-[2.2]" aria-hidden="true" />
            </div>

            <div>
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40">
                {warningLevel === 1 ? 'Warning Strike 1 / 2' : warningLevel === 2 ? 'Final Warning Strike 2 / 2' : 'Examination Terminated'}
              </span>

              <h2 id="warning-modal-title" className="text-lg sm:text-2xl font-serif font-bold text-rose-600 dark:text-rose-200 mt-2 sm:mt-3">
                {warningLevel < 3 ? 'Window Blur or Fullscreen Exit Detected!' : 'Third Violation: Auto-Submitted'}
              </h2>

              <p className="text-xs text-slate-700 dark:text-slate-300 mt-2 leading-relaxed">
                {warningLevel === 1 && (
                  <>
                    The system detected that you switched browser tabs, exited fullscreen mode, minimized the window, or lost active app focus. 
                    Nexus Ranaji English School policy allows <strong className="text-amber-600 dark:text-amber-400">exactly 2 warnings</strong>. Return to your test immediately.
                  </>
                )}
                {warningLevel === 2 && (
                  <>
                    <strong className="text-rose-600 dark:text-rose-400">CRITICAL FINAL WARNING:</strong> This is your 2nd strike. 
                    Any further focus loss, fullscreen exit, or tab navigation will automatically submit your exam and permanently flag you for academic malpractice!
                  </>
                )}
                {warningLevel === 3 && (
                  <>
                    You have exceeded the maximum permitted infractions (3 strikes logged). Your examination paper has been automatically submitted and reported to the invigilator.
                  </>
                )}
              </p>
            </div>

            {warningLevel < 3 ? (
              <button
                type="button"
                onClick={() => {
                  setWarningModalOpen(false);
                  enterFullscreen();
                }}
                className="w-full py-3 min-h-[44px] bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-500/30 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                I Understand &amp; Return to Fullscreen Examination
              </button>
            ) : (
              <p className="text-xs font-mono text-slate-400">
                Finalizing automatic submission payload...
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default ExamTestingEngine;
