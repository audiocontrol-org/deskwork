// Types for event mapping
export interface EventMapping {
  eventType: string;
  commandFilter: (command: string) => boolean;
  handler: (event: unknown) => Promise<void>;
}
