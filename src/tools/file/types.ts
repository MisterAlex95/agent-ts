export interface ListFilesResult {
  root: string;
  files: string[];
  entries: Array<{ name: string; path: string; type: "file" | "directory" }>;
}

export interface ReadFileResult {
  path: string;
  contentSnippet: string;
  truncated: boolean;
  totalChars: number;
}

export interface WriteFileResult {
  path: string;
  previousContentSnippet?: string;
  newContentSnippet: string;
  truncated: boolean;
  previousContentChars?: number;
  newContentChars: number;
}

export interface AppendFileResult {
  path: string;
  previousContentSnippet: string;
  appendedContentSnippet: string;
  truncated: boolean;
  previousContentChars: number;
  appendedContentChars: number;
}

export type FilePatchOperation = {
  type: "replace";
  search: string;
  replace: string;
};

export interface PatchFileResult {
  path: string;
  previousContentSnippet: string;
  newContentSnippet: string;
  appliedOperations: number;
  truncated: boolean;
  previousContentChars: number;
  newContentChars: number;
}

export interface EditLineOp {
  line: number;
  content: string;
  mode?: "replace" | "insert";
}

export interface EditLinesResult {
  path: string;
  applied: number;
  message: string;
}

export interface MkdirResult {
  path: string;
}

export interface TouchResult {
  path: string;
  existed: boolean;
}

export interface DeleteFileResult {
  path: string;
  deleted: true;
}

export interface DeleteFilesResult {
  deleted: string[];
  errors?: string[];
}

export interface DeleteFolderResult {
  path: string;
  deletedFiles: string[];
}

export interface DeletePathResult {
  path: string;
  deleted: true;
  type: "file" | "directory";
  deletedFiles?: string[];
}

export interface MoveFileResult {
  from: string;
  to: string;
}

export interface CopyFileResult {
  from: string;
  to: string;
}

export interface GrepMatch {
  path: string;
  lineNumber: number;
  line: string;
  match: string;
}

export interface GrepResult {
  pattern: string;
  path: string;
  matches: GrepMatch[];
  truncated: boolean;
}

export interface FindFilesResult {
  path: string;
  pattern: string;
  files: string[];
}

export interface FileExistsResult {
  path: string;
  exists: boolean;
}

export interface WcResult {
  path: string;
  lines: number;
  words: number;
  bytes: number;
}

export interface ReferencedByResult {
  path: string;
  stem: string;
  referencedBy: Array<{ path: string; lineNumber: number; line: string }>;
}

export interface SearchReplaceResult {
  path: string;
  replaced: boolean;
  message: string;
}
