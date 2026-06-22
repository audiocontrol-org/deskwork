// Types for version checking
export interface VersionChecker {
  getPluginVersion(): string;
  getCLIVersion(): Promise<string | null>;
  checkVersionMatch(): Promise<boolean>;
}
