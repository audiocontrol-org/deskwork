// Types for CLI result
export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Types for version info
export interface VersionInfo {
  plugin: string;
  cli: string;
  match: boolean;
}
