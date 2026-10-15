import React, { useState, useRef } from 'react';
import { apiClient } from '../../lib/apiClient';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Clock, 
  Calendar, 
  BookOpen, 
  Layers, 
  Sparkles, 
  HelpCircle,
  FileText,
  ArrowRight
} from 'lucide-react';
import { SchoolClass, Division, Subject } from '../../types';

interface BulkQuestionUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: SchoolClass[];
  divisions: Division[];
  subjects: Subject[];
  teacherId: string;
  onUploadSuccess: (createdExam?: any) => void;
}

interface ParsedQuestion {
  id?: string;
  text: string;
  type: 'single' | 'multiple' | 'true_false' | 'integer';
  options: { id: string; text: string }[];
  correctAnswer: string | string[];
  explanation: string;
  points: number;
  chapterName: string;
  originalRowNumber: number;
}

interface RowError {
  rowNumber: number;
  originalData: Record<string, any>;
  reason: string;
}

export const BulkQuestionUploadModal: React.FC<BulkQuestionUploadModalProps> = ({
  isOpen,
  onClose,
  classes,
  divisions,
  subjects,
  teacherId,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedValidQuestions, setParsedValidQuestions] = useState<ParsedQuestion[]>([]);
  const [mismatchedRows, setMismatchedRows] = useState<RowError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-schedule test configuration
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [examTitle, setExamTitle] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0]?.id || 'sub-phy');
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || 'cls-10');
  const [selectedDivisionId, setSelectedDivisionId] = useState('all');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [passingScore, setPassingScore] = useState(40);
  const [publishNow, setPublishNow] = useState(true);
  const [startTime, setStartTime] = useState(new Date().toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState(
    new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16)
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // 1. Download Pre-Formatted Blank Sample Template
  const handleDownloadTemplate = async (format: 'xlsx' | 'csv') => {
    const XLSX = await import('xlsx');
    const templateData = [
      {
        'Question Number': 1,
        'Question Title': 'What is the speed of light in vacuum? $c = 3 \\times 10^8\\text{ m/s}$',
        'Question Type': 'single',
        'Option A': 'True',
        'Option B': 'False',
        'Option C': 'Partially True',
        'Option D': 'Undefined',
        'Correct Answer': 'A',
        'Points': 2,
        'Explanation': 'The universally accepted value of speed of light in vacuum is exactly $3 \\times 10^8$ m/s.',
        'Chapter / Topic': 'Optics & Electromagnetism'
      },
      {
        'Question Number': 2,
        'Question Title': 'Which of the following are greenhouse gases? (Multiple selection)',
        'Question Type': 'multiple',
        'Option A': 'Carbon Dioxide (CO2)',
        'Option B': 'Methane (CH4)',
        'Option C': 'Argon (Ar)',
        'Option D': 'Nitrous Oxide (N2O)',
        'Correct Answer': 'A,B,D',
        'Points': 3,
        'Explanation': 'CO2, CH4, and N2O trap thermal infrared radiation.',
        'Chapter / Topic': 'Environmental Chemistry'
      },
      {
        'Question Number': 3,
        'Question Title': 'Calculate focal length using formula: $\\frac{1}{f} = \\frac{1}{v} - \\frac{1}{u}$ where $u = -30\\text{cm}, v = +15\\text{cm}$',
        'Question Type': 'single',
        'Option A': '+10 cm',
        'Option B': '-10 cm',
        'Option C': '+15 cm',
        'Option D': '-30 cm',
        'Correct Answer': 'A',
        'Points': 4,
        'Explanation': '1/f = 1/15 - (-1/30) = 2/30 + 1/30 = 3/30 = 1/10 => f = +10 cm.',
        'Chapter / Topic': 'Light: Refraction'
      },
      {
        'Question Number': 4,
        'Question Title': 'Energy can neither be created nor destroyed in an isolated system.',
        'Question Type': 'true_false',
        'Option A': 'True',
        'Option B': 'False',
        'Option C': '',
        'Option D': '',
        'Correct Answer': 'True',
        'Points': 1,
        'Explanation': 'First Law of Thermodynamics (Conservation of Energy).',
        'Chapter / Topic': 'Thermodynamics'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Questions');

    if (format === 'xlsx') {
      XLSX.writeFile(workbook, 'nexus_bulk_question_template.xlsx');
    } else {
      XLSX.writeFile(workbook, 'nexus_bulk_question_template.csv');
    }
  };

  // 2. Parse & Validate Uploaded Excel File
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    processExcelFile(selected);
  };

  const processExcelFile = async (fileObj: File) => {
    setParsing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setParsedValidQuestions([]);
    setMismatchedRows([]);

    try {
      const XLSX = await import('xlsx');
      const data = await fileObj.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rawRows || rawRows.length === 0) {
        throw new Error('The uploaded spreadsheet contains no data rows.');
      }

      const validList: ParsedQuestion[] = [];
      const errorList: RowError[] = [];

      // Helper function to find column value by loose header name
      const getVal = (row: any, keys: string[]) => {
        const rowKeys = Object.keys(row);
        for (const k of keys) {
          const matched = rowKeys.find(
            (rk) => rk.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === k.toLowerCase().replace(/[^a-z0-9]/g, '')
          );
          if (matched && row[matched] !== undefined && row[matched] !== '') {
            return String(row[matched]).trim();
          }
        }
        return '';
      };

      rawRows.forEach((row, idx) => {
        const rowNum = idx + 2; // Row index in Excel (1-based + 1 header)

        const title = getVal(row, ['Question Title', 'Question Text', 'Question', 'Title', 'Text', 'Prompt']);
        const rawType = getVal(row, ['Question Type', 'Type', 'QuestionType']).toLowerCase();
        const optA = getVal(row, ['Option A', 'Option 1', 'Opt A', 'A']);
        const optB = getVal(row, ['Option B', 'Option 2', 'Opt B', 'B']);
        const optC = getVal(row, ['Option C', 'Option 3', 'Opt C', 'C']);
        const optD = getVal(row, ['Option D', 'Option 4', 'Opt D', 'D']);
        const rawAns = getVal(row, ['Correct Answer', 'Answer', 'Correct', 'Ans', 'Key']);
        const rawPoints = getVal(row, ['Points', 'Marks', 'Score', 'Point']);
        const explanation = getVal(row, ['Explanation', 'Solution', 'Reason']);
        const chapter = getVal(row, ['Chapter / Topic', 'Chapter', 'Topic', 'Unit']) || 'General Curriculum';

        // Validation Rules:
        // 1. Question Title/Text presence
        if (!title) {
          errorList.push({
            rowNumber: rowNum,
            originalData: row,
            reason: 'Question Title / Text is required and was left empty.',
          });
          return;
        }

        // 2. Normalize Question Type
        let type: 'single' | 'multiple' | 'true_false' | 'integer' = 'single';
        if (rawType.includes('multi')) type = 'multiple';
        else if (rawType.includes('true') || rawType.includes('tf')) type = 'true_false';
        else if (rawType.includes('int') || rawType.includes('num')) type = 'integer';
        else if (rawType && !rawType.includes('single') && !rawType.includes('mcq')) {
          errorList.push({
            rowNumber: rowNum,
            originalData: row,
            reason: `Invalid Question Type "${rawType}". Expected "single", "multiple", "true_false", or "integer".`,
          });
          return;
        }

        // 3. Option Constraints
        const options: { id: string; text: string }[] = [];
        if (type === 'true_false') {
          options.push({ id: 'opt-a', text: optA || 'True' });
          options.push({ id: 'opt-b', text: optB || 'False' });
        } else if (type === 'integer') {
          // No specific options needed for integer type
        } else {
          // single / multiple choice requires at least 2 options
          if (optA) options.push({ id: 'opt-a', text: optA });
          if (optB) options.push({ id: 'opt-b', text: optB });
          if (optC) options.push({ id: 'opt-c', text: optC });
          if (optD) options.push({ id: 'opt-d', text: optD });

          if (options.length < 2) {
            errorList.push({
              rowNumber: rowNum,
              originalData: row,
              reason: 'Multiple Choice questions require at least Option A and Option B.',
            });
            return;
          }
        }

        // 4. Correct Answer Validation
        if (!rawAns) {
          errorList.push({
            rowNumber: rowNum,
            originalData: row,
            reason: 'Correct Answer is missing.',
          });
          return;
        }

        let correctAnswer: string | string[] = '';
        if (type === 'single') {
          const upper = rawAns.toUpperCase();
          if (upper === 'A' || upper === 'OPTION A' || upper === '1') correctAnswer = 'opt-a';
          else if (upper === 'B' || upper === 'OPTION B' || upper === '2') correctAnswer = 'opt-b';
          else if (upper === 'C' || upper === 'OPTION C' || upper === '3') correctAnswer = 'opt-c';
          else if (upper === 'D' || upper === 'OPTION D' || upper === '4') correctAnswer = 'opt-d';
          else {
            // Check direct text match
            const matchedOpt = options.find((o) => o.text.trim().toLowerCase() === rawAns.trim().toLowerCase());
            if (matchedOpt) {
              correctAnswer = matchedOpt.id;
            } else {
              errorList.push({
                rowNumber: rowNum,
                originalData: row,
                reason: `Correct Answer "${rawAns}" does not match options A, B, C, or D.`,
              });
              return;
            }
          }
        } else if (type === 'multiple') {
          const parts = rawAns.split(/[,;\s]+/).map((p) => p.trim().toUpperCase());
          const mapped: string[] = [];
          for (const p of parts) {
            if (p === 'A' || p === '1') mapped.push('opt-a');
            else if (p === 'B' || p === '2') mapped.push('opt-b');
            else if (p === 'C' || p === '3') mapped.push('opt-c');
            else if (p === 'D' || p === '4') mapped.push('opt-d');
          }
          if (mapped.length === 0) {
            errorList.push({
              rowNumber: rowNum,
              originalData: row,
              reason: `Multiple choice answer "${rawAns}" must list options like "A,B" or "A, C, D".`,
            });
            return;
          }
          correctAnswer = mapped;
        } else if (type === 'true_false') {
          const low = rawAns.toLowerCase();
          if (low === 'true' || low === 't' || low === 'a') correctAnswer = 'opt-a';
          else if (low === 'false' || low === 'f' || low === 'b') correctAnswer = 'opt-b';
          else {
            errorList.push({
              rowNumber: rowNum,
              originalData: row,
              reason: `True/False answer "${rawAns}" must be "True", "False", "A", or "B".`,
            });
            return;
          }
        } else {
          correctAnswer = rawAns;
        }

        // 5. Points validation
        const pointsNum = Number(rawPoints) || 1;
        if (pointsNum <= 0 || isNaN(pointsNum)) {
          errorList.push({
            rowNumber: rowNum,
            originalData: row,
            reason: `Points value "${rawPoints}" must be a positive number.`,
          });
          return;
        }

        // Passed all validation checks!
        validList.push({
          text: title,
          type,
          options,
          correctAnswer,
          explanation,
          points: pointsNum,
          chapterName: chapter,
          originalRowNumber: rowNum,
        });
      });

      setParsedValidQuestions(validList);
      setMismatchedRows(errorList);

      if (validList.length > 0 && !examTitle) {
        setExamTitle(`Curriculum Assessment - ${validList.length} Questions`);
      }
    } catch (err: any) {
      console.error('Error parsing excel:', err);
      setErrorMessage(err.message || 'Failed to parse Excel file. Please ensure valid .xlsx or .csv format.');
    } finally {
      setParsing(false);
    }
  };

  // 3. Give Back the Mismatched/Error Rows as an Excel Sheet for Teacher Review
  const handleDownloadErrorSheet = async () => {
    if (mismatchedRows.length === 0) return;
    const XLSX = await import('xlsx');

    const errorRowsExport = mismatchedRows.map((err) => ({
      'Row In Original File': err.rowNumber,
      'Validation_Error_Reason': err.reason,
      ...err.originalData,
    }));

    const worksheet = XLSX.utils.json_to_sheet(errorRowsExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mismatched_Errors_To_Review');
    XLSX.writeFile(workbook, 'nexus_mismatched_questions_review.xlsx');
  };

  // 4. Submit Valid Questions & Automatically Schedule Exam
  const handleExecuteUpload = async () => {
    if (parsedValidQuestions.length === 0) {
      setErrorMessage('No valid questions available to import.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: any = {
        questions: parsedValidQuestions,
        autoScheduleExam: autoSchedule,
      };

      if (autoSchedule) {
        payload.examDetails = {
          title: examTitle.trim() || `Auto Scheduled Exam (${new Date().toLocaleDateString()})`,
          subjectId: selectedSubjectId,
          classId: selectedClassId,
          divisionId: selectedDivisionId,
          durationMinutes: Number(durationMinutes) || 45,
          passingScore: Number(passingScore) || 40,
          publishNow,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        };
      }

      const res = await apiClient.post('/api/teacher/bulk-questions', payload);
      const data = res.data;

      setSuccessMessage(data.message || 'Questions uploaded and test scheduled successfully!');
      setTimeout(() => {
        onUploadSuccess(data.exam);
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit questions to server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-serif font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Bulk Excel Question Upload &amp; Test Auto-Scheduler
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload `.xlsx` / `.csv` sheets with automatic error detection &amp; instant exam generation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Download Templates Banner */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Step 1: Download Standard Question Template
              </h4>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                Pre-formatted columns including LaTeX math, multi-choice, true/false, and explanations.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadTemplate('xlsx')}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Template (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTemplate('csv')}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV Template</span>
              </button>
            </div>
          </div>

          {/* File Upload Zone */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Step 2: Upload Filled Excel Sheet (.xlsx / .xls / .csv)
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-3xl p-6 text-center cursor-pointer bg-slate-50/50 dark:bg-slate-950/20 hover:bg-emerald-500/5 transition-all group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {file ? file.name : 'Click to select or drag & drop your Excel question sheet here'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)
              </p>
            </div>
          </div>

          {/* Parsing State */}
          {parsing && (
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-3 text-xs text-slate-600 dark:text-slate-300 animate-pulse">
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>Analyzing spreadsheet headers and validating questions row-by-row...</span>
            </div>
          )}

          {/* Error & Success Alerts */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Validation Analysis Dashboard (Visible once a file has been parsed) */}
          {(parsedValidQuestions.length > 0 || mismatchedRows.length > 0) && (
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Validation Analysis &amp; Row Integrity Check
                </h4>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold">
                    ✓ {parsedValidQuestions.length} Valid
                  </span>
                  <span className={`px-2.5 py-1 rounded-full font-bold border ${
                    mismatchedRows.length > 0
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}>
                    ⚠ {mismatchedRows.length} Mismatched
                  </span>
                </div>
              </div>

              {/* Mismatched Rows "Give Back" Download Section */}
              {mismatchedRows.length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h5 className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                        {mismatchedRows.length} Row(s) Did Not Match Required Format
                      </h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Download the error spreadsheet, fix only the flagged rows, and re-upload. Valid rows can still be imported now!
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadErrorSheet}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Error Rows (.xlsx)</span>
                    </button>
                  </div>

                  {/* Quick Preview of First Few Errors */}
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {mismatchedRows.slice(0, 5).map((err, i) => (
                      <div
                        key={i}
                        className="text-[11px] p-2 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-950 flex items-start justify-between gap-2"
                      >
                        <div>
                          <span className="font-mono font-bold text-rose-600 dark:text-rose-400 mr-2">
                            Row {err.rowNumber}:
                          </span>
                          <span className="text-slate-700 dark:text-slate-300">
                            {err.reason}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                          {err.originalData['Question Title'] || err.originalData['Question'] || 'Empty row'}
                        </span>
                      </div>
                    ))}
                    {mismatchedRows.length > 5 && (
                      <p className="text-[10px] text-slate-400 text-center pt-1 font-mono">
                        + {mismatchedRows.length - 5} more error rows in downloaded sheet
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Automatic Test Scheduling Controls */}
              {parsedValidQuestions.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-4">
                  
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSchedule}
                        onChange={(e) => setAutoSchedule(e.target.checked)}
                        className="w-4 h-4 rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-0"
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        Automatically Schedule Test with These {parsedValidQuestions.length} Questions
                      </span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Total Points: {parsedValidQuestions.reduce((s, q) => s + q.points, 0)} marks
                    </span>
                  </div>

                  {autoSchedule && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 text-xs">
                      <div className="sm:col-span-2 md:col-span-3 space-y-1">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">Test Title</label>
                        <input
                          type="text"
                          value={examTitle}
                          onChange={(e) => setExamTitle(e.target.value)}
                          placeholder="e.g. Standard 10 Physics Mid-Term Unit Test"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">Subject</label>
                        <select
                          value={selectedSubjectId}
                          onChange={(e) => setSelectedSubjectId(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          {subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">Class &amp; Division</label>
                        <select
                          value={selectedClassId}
                          onChange={(e) => setSelectedClassId(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">Division Filter</label>
                        <select
                          value={selectedDivisionId}
                          onChange={(e) => setSelectedDivisionId(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All Divisions</option>
                          {divisions
                            .filter((d) => d.classId === selectedClassId)
                            .map((d) => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">Duration (Minutes)</label>
                        <input
                          type="number"
                          min="5"
                          max="240"
                          value={durationMinutes}
                          onChange={(e) => setDurationMinutes(Number(e.target.value))}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">Passing Score (%)</label>
                        <input
                          type="number"
                          min="10"
                          max="100"
                          value={passingScore}
                          onChange={(e) => setPassingScore(Number(e.target.value))}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="space-y-1 flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer pb-2.5">
                          <input
                            type="checkbox"
                            checked={publishNow}
                            onChange={(e) => setPublishNow(e.target.checked)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
                          />
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">
                            Publish Immediately
                          </span>
                        </label>
                      </div>

                      <div className="space-y-1 sm:col-span-2 md:col-span-1">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">Start Time</label>
                        <input
                          type="datetime-local"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs"
                        />
                      </div>

                      <div className="space-y-1 sm:col-span-2 md:col-span-2">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">End Time (Exam Window Close)</label>
                        <input
                          type="datetime-local"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs"
                        />
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {parsedValidQuestions.length > 0 && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleExecuteUpload}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Importing &amp; Scheduling...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {autoSchedule
                        ? `Import ${parsedValidQuestions.length} Questions & Schedule Exam`
                        : `Import ${parsedValidQuestions.length} Questions to Bank`}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
