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
  Users, 
  KeyRound, 
  ShieldCheck, 
  GraduationCap, 
  BookOpen, 
  FileText, 
  ArrowRight,
  Copy,
  Check
} from 'lucide-react';
import { UserCredential, SchoolClass, Division } from '../../types';

interface BulkCredentialUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: SchoolClass[];
  divisions: Division[];
  existingUsers: UserCredential[];
  onUploadSuccess: () => void;
}

interface ParsedUserRow {
  name: string;
  role: 'student' | 'teacher' | 'parent' | 'superadmin';
  username?: string;
  email?: string;
  password?: string;
  rollNo?: string;
  employeeId?: string;
  className?: string;
  divisionName?: string;
  phone?: string;
  parentId?: string;
  originalRowNumber: number;
}

interface CredentialRowError {
  rowNumber: number;
  originalData: Record<string, any>;
  reason: string;
}

export const BulkCredentialUploadModal: React.FC<BulkCredentialUploadModalProps> = ({
  isOpen,
  onClose,
  classes,
  divisions,
  existingUsers,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [validUsers, setValidUsers] = useState<ParsedUserRow[]>([]);
  const [mismatchedRows, setMismatchedRows] = useState<CredentialRowError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdUsers, setCreatedUsers] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // 1. Download Blank Sample Credential Template
  // Class Name values must match existing classes (e.g. "Standard 10 (SSC)", "Standard 9", "Standard 8")
  const handleDownloadTemplate = async (format: 'xlsx' | 'csv') => {
    const XLSX = await import('xlsx');
    // Prefer first real class name from props so template stays in sync
    const sampleClassName = classes[0]?.name || 'Standard 10 (SSC)';
    const sampleDivName = divisions.find((d) => d.classId === classes[0]?.id)?.name || 'Division A';

    const templateData = [
      {
        'Full Name': 'Ananya Sharma',
        'Role': 'student',
        'Username': 'student.ananya',
        'Email': 'ananya.sharma@student.nexusrana.edu',
        'Password': 'StudentPass#2026',
        'Roll Number': 'NRES-10A-15',
        'Employee ID': '',
        'Class Name': sampleClassName,
        'Division Name': sampleDivName,
        'Phone Number': '+91 98201 11223',
      },
      {
        'Full Name': 'Kabir Varma',
        'Role': 'student',
        'Username': 'student.kabir',
        'Email': 'kabir.varma@student.nexusrana.edu',
        'Password': '',
        'Roll Number': 'NRES-10A-16',
        'Employee ID': '',
        'Class Name': sampleClassName,
        'Division Name': sampleDivName,
        'Phone Number': '',
      },
      {
        'Full Name': 'Dr. Sunita Kulkarni',
        'Role': 'teacher',
        'Username': 'teacher.sunita',
        'Email': 'sunita.kulkarni@nexusrana.edu',
        'Password': 'NexusTeacher#2026',
        'Roll Number': '',
        'Employee ID': 'NRES-FAC-112',
        'Class Name': '',
        'Division Name': '',
        'Phone Number': '+91 98199 44332',
      },
      {
        'Full Name': 'Mr. Rakesh Varma',
        'Role': 'parent',
        'Username': 'parent.varma',
        'Email': 'rakesh.varma@parent.nexusrana.edu',
        'Password': 'ParentPass#2026',
        'Roll Number': '',
        'Employee ID': '',
        'Class Name': '',
        'Division Name': '',
        'Phone Number': '+91 98201 55667',
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Credentials_Template');

    if (format === 'xlsx') {
      XLSX.writeFile(workbook, 'nexus_bulk_credentials_template.xlsx');
    } else {
      XLSX.writeFile(workbook, 'nexus_bulk_credentials_template.csv');
    }
  };

  // 2. Parse & Validate Uploaded Spreadsheet
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
    setValidUsers([]);
    setMismatchedRows([]);
    setCreatedUsers([]);

    try {
      const XLSX = await import('xlsx');
      const data = await fileObj.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rawRows || rawRows.length === 0) {
        throw new Error('The spreadsheet contains no readable data rows.');
      }

      const validList: ParsedUserRow[] = [];
      const errorList: CredentialRowError[] = [];

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
        const rowNum = idx + 2;

        const name = getVal(row, ['Full Name', 'Name', 'Student Name', 'Teacher Name', 'User Name', 'FullName']);
        const rawRole = getVal(row, ['Role', 'User Role', 'Account Type']).toLowerCase();
        const username = getVal(row, ['Username', 'User ID', 'Login ID']);
        const email = getVal(row, ['Email', 'Email Address', 'Institutional Email']);
        const password = getVal(row, ['Password', 'Pass', 'Secret']);
        const rollNo = getVal(row, ['Roll Number', 'Roll No', 'Roll', 'RollNo']);
        const employeeId = getVal(row, ['Employee ID', 'Emp ID', 'Staff ID', 'EmpID']);
        const className = getVal(row, ['Class Name', 'Class', 'Standard', 'Grade']);
        const divisionName = getVal(row, ['Division Name', 'Division', 'Section']);
        const phone = getVal(row, ['Phone Number', 'Phone', 'Mobile', 'Contact']);

        // Validation Rules:
        // 1. Name presence
        if (!name) {
          errorList.push({
            rowNumber: rowNum,
            originalData: row,
            reason: 'Full Name is required and was left empty.',
          });
          return;
        }

        // 2. Role validation
        let role: 'student' | 'teacher' | 'parent' | 'superadmin' = 'student';
        if (rawRole.includes('teach') || rawRole.includes('facul')) role = 'teacher';
        else if (rawRole.includes('admin') || rawRole.includes('dir')) role = 'superadmin';
        else if (rawRole.includes('parent') || rawRole.includes('guard')) role = 'parent';
        else if (rawRole.includes('stud')) role = 'student';
        else if (rawRole && !rawRole.includes('stud')) {
          errorList.push({
            rowNumber: rowNum,
            originalData: row,
            reason: `Invalid Role "${rawRole}". Expected "student", "teacher", "parent", or "superadmin".`,
          });
          return;
        }

        // 3. Username uniqueness against existing users and already processed batch
        if (username) {
          const existsInDB = existingUsers.some(
            (u) => u.username && u.username.toLowerCase() === username.toLowerCase()
          );
          const existsInBatch = validList.some(
            (u) => u.username && u.username.toLowerCase() === username.toLowerCase()
          );
          if (existsInDB || existsInBatch) {
            errorList.push({
              rowNumber: rowNum,
              originalData: row,
              reason: `Username "${username}" is already assigned to another account in the system.`,
            });
            return;
          }
        }

        // 4. Student specific requirements
        if (role === 'student') {
          if (!rollNo && !className) {
            errorList.push({
              rowNumber: rowNum,
              originalData: row,
              reason: 'Student records require either a Roll Number or a Class Name.',
            });
            return;
          }
        }

        // Passed validation!
        validList.push({
          name,
          role,
          username: username || undefined,
          email: email || undefined,
          password: password || undefined,
          rollNo: rollNo || undefined,
          employeeId: employeeId || undefined,
          className: className || undefined,
          divisionName: divisionName || undefined,
          phone: phone || undefined,
          originalRowNumber: rowNum,
        });
      });

      setValidUsers(validList);
      setMismatchedRows(errorList);
    } catch (err: any) {
      console.error('Error parsing excel:', err);
      setErrorMessage(err.message || 'Failed to read spreadsheet file. Please check format.');
    } finally {
      setParsing(false);
    }
  };

  // 3. Give Back the Mismatched/Error Rows as an Excel Sheet
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
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mismatched_Credentials');
    XLSX.writeFile(workbook, 'nexus_mismatched_credentials_review.xlsx');
  };

  // 4. Download Generated Credentials Export for Distribution to Students/Parents
  const handleDownloadGeneratedSheet = async () => {
    if (createdUsers.length === 0) return;
    const XLSX = await import('xlsx');

    const exportData = createdUsers.map((u, i) => {
      const className = classes.find((c) => c.id === u.classId)?.name || u.classId || 'N/A';
      const divisionName = divisions.find((d) => d.id === u.divisionId)?.name || u.divisionId || 'N/A';
      return {
        'S.No': i + 1,
        'Full Name': u.name,
        'Institutional Role': u.role.toUpperCase(),
        'Username': u.username,
        'Assigned Password': u.password,
        'Roll Number': u.rollNo || 'N/A',
        'Employee ID': u.employeeId || 'N/A',
        'Class': className,
        'Division': divisionName,
        'Email': u.email || 'N/A',
        'Phone': u.phone || 'N/A',
        'Portal URL': window.location.origin,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Active_Credentials');
    XLSX.writeFile(workbook, 'nexus_generated_credentials_distribution.xlsx');
  };

  // 5. Submit Valid Credentials to Server
  const handleExecuteUpload = async () => {
    if (validUsers.length === 0) {
      setErrorMessage('No valid credential rows to generate.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.post('/api/admin/credentials/bulk', { users: validUsers });
      const data = res.data;

      setCreatedUsers(data.users || []);
      setSuccessMessage(
        `Successfully generated credentials for ${data.importedCount} user accounts!`
      );
      onUploadSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Server failed to process bulk credential creation.');
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
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20 shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-serif font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Bulk Excel Login Credential Generator
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload `.xlsx` / `.csv` rosters to auto-generate student, faculty, and parent credentials
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
          <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Step 1: Download Standard Credential Roster Template
              </h4>
              <p className="text-[11px] text-indigo-700/80 dark:text-indigo-400/80">
                Pre-formatted columns for Student (Roll No, Class), Faculty (Emp ID), and Parents.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadTemplate('xlsx')}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Template (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTemplate('csv')}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV Template</span>
              </button>
            </div>
          </div>

          {/* File Upload Zone */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Step 2: Upload User Roster (.xlsx / .xls / .csv)
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-500 rounded-3xl p-6 text-center cursor-pointer bg-slate-50/50 dark:bg-slate-950/20 hover:bg-amber-500/5 transition-all group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {file ? file.name : 'Click to select or drag & drop your Excel student/faculty roster here'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Passwords and usernames are automatically securely generated if omitted.
              </p>
            </div>
          </div>

          {/* Parsing State */}
          {parsing && (
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-3 text-xs text-slate-600 dark:text-slate-300 animate-pulse">
              <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span>Validating roster rows and checking for duplicate usernames/roll numbers...</span>
            </div>
          )}

          {/* Alerts */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs space-y-2">
              <div className="flex items-center gap-2.5 font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                Download the distribution sheet below to view and share login IDs and passwords with students and teachers.
              </p>
              <button
                type="button"
                onClick={handleDownloadGeneratedSheet}
                className="mt-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Generated Credential Roster (.xlsx)</span>
              </button>
            </div>
          )}

          {/* Validation Analysis Dashboard */}
          {(validUsers.length > 0 || mismatchedRows.length > 0) && (
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Roster Row Integrity Check
                </h4>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold">
                    ✓ {validUsers.length} Ready to Create
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

              {/* Mismatched Rows "Give Back" Error Download */}
              {mismatchedRows.length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h5 className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                        {mismatchedRows.length} Row(s) Contain Errors or Duplicate IDs
                      </h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Download the mismatched rows, correct the values in Excel, and upload again.
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

                  {/* Preview of Mismatched Rows */}
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
                          {err.originalData['Full Name'] || err.originalData['Name'] || 'Empty'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Valid Users Table Preview */}
              {validUsers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Preview of Valid Accounts to Generate ({validUsers.length} total):
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 text-[10px] uppercase font-bold sticky top-0">
                        <tr>
                          <th className="p-2.5">Name</th>
                          <th className="p-2.5">Role</th>
                          <th className="p-2.5">Roll / Emp ID</th>
                          <th className="p-2.5">Class &amp; Div</th>
                          <th className="p-2.5">Auto Password</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                        {validUsers.slice(0, 10).map((u, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                            <td className="p-2.5 font-medium">{u.name}</td>
                            <td className="p-2.5">
                              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {u.role}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-[11px]">{u.rollNo || u.employeeId || 'Auto'}</td>
                            <td className="p-2.5 text-[11px]">{u.className || 'Standard 10'} {u.divisionName ? `(${u.divisionName})` : ''}</td>
                            <td className="p-2.5 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                              {u.password || 'Auto Secure'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {validUsers.length > 10 && (
                    <p className="text-[10px] text-slate-400 text-center font-mono">
                      + {validUsers.length - 10} more accounts ready in batch
                    </p>
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
            {validUsers.length > 0 && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleExecuteUpload}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Generating Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Generate {validUsers.length} User Accounts</span>
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
