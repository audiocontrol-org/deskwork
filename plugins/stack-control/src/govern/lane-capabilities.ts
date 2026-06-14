import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadInstallationConfig } from '../config/config-loader.js';
import { configPathFor } from '../config/installation.js';
import { resolvePaths } from '../config/resolve-paths.js';
import { loadAuditBarrageConfig } from '../scope-discovery/audit-barrage/config-loader.js';
import type {
  EnforcementState,
  LivenessState,
  ModelConfig,
  OutputMode,
} from '../scope-discovery/audit-barrage/types.js';
import { isLaneEnforced } from '../scope-discovery/audit-barrage/types.js';

export interface LanePayloadEnvelope {
  readonly maxPromptBytes: number;
  readonly source: 'fleet-knowledge';
}

export interface LaneCapabilityProfile {
  readonly name: string;
  readonly model: string;
  readonly binary: string;
  readonly availability: 'available' | 'unavailable';
  readonly outputMode: OutputMode;
  readonly enforcement: EnforcementState;
  readonly liveness: LivenessState;
  readonly envelope: LanePayloadEnvelope;
  readonly timeoutBasis:
    | { readonly mode: 'override'; readonly timeoutSeconds: number }
    | {
        readonly mode: 'derived';
        readonly timeoutFloorSeconds: number;
        readonly timeoutSecsPerKb: number;
      };
}

interface FleetKnowledgeDoc {
  readonly lanes?: readonly FleetKnowledgeLane[];
}

interface FleetKnowledgeLane {
  readonly name?: unknown;
  readonly max_prompt_bytes?: unknown;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_KNOWLEDGE_PATH = join(HERE, '..', '..', 'templates', 'fleet-knowledge.yaml');

export async function loadLaneCapabilities(
  installationRoot: string,
  probeBinary: (binary: string) => boolean = binaryExistsOnPath,
): Promise<readonly LaneCapabilityProfile[]> {
  const config = await loadAuditBarrageConfig(installationRoot);
  const knownEnvelopes = readFleetKnowledge(
    installationRoot,
    config.models.map((model) => model.name),
  );
  return config.models.map((model) =>
    normalizeLaneCapability(model, knownEnvelopes.get(model.name), probeBinary(model.binary)),
  );
}

function normalizeLaneCapability(
  model: ModelConfig,
  knownEnvelope: number | undefined,
  available: boolean,
): LaneCapabilityProfile {
  const timeoutBasis =
    model.timeoutSeconds !== undefined
      ? { mode: 'override' as const, timeoutSeconds: model.timeoutSeconds }
      : {
          mode: 'derived' as const,
          timeoutFloorSeconds: model.timeoutFloorSeconds ?? 300,
          timeoutSecsPerKb: model.timeoutSecsPerKb ?? 8,
        };
  return {
    name: model.name,
    model: model.model,
    binary: model.binary,
    availability: available ? 'available' : 'unavailable',
    outputMode: model.outputMode,
    enforcement: isLaneEnforced(model) ? 'enforced' : 'unenforced',
    liveness: model.livenessSignal === 'none' ? 'unmonitored' : 'monitored',
    envelope: { maxPromptBytes: requireKnownEnvelope(model, knownEnvelope), source: 'fleet-knowledge' },
    timeoutBasis,
  };
}

function requireKnownEnvelope(
  model: ModelConfig,
  knownEnvelope: number | undefined,
): number {
  if (knownEnvelope !== undefined) {
    return knownEnvelope;
  }
  throw new Error(
    `lane '${model.name}' needs fleet-knowledge.yaml max_prompt_bytes; ` +
      'timeout calibration is not a prompt-capacity signal',
  );
}

function readFleetKnowledge(
  installationRoot: string,
  expectedLaneNames: readonly string[],
): ReadonlyMap<string, number> {
  const overridePath = resolveFleetKnowledgePath(installationRoot);
  const sourcePath = existsSync(overridePath) ? overridePath : DEFAULT_KNOWLEDGE_PATH;
  if (!existsSync(sourcePath)) return new Map();
  const parsed = parseYaml(readFileSync(sourcePath, 'utf8')) as FleetKnowledgeDoc | null;
  if (parsed === null || parsed === undefined) return new Map();
  if (!Array.isArray(parsed.lanes)) {
    throw new Error(`${sourcePath}: lanes must be a list`);
  }
  const pairs: Array<readonly [string, number]> = [];
  const seen = new Set<string>();
  for (const lane of parsed.lanes) {
    if (typeof lane !== 'object' || lane === null) {
      throw new Error(`${sourcePath}: each fleet-knowledge lane must be an object`);
    }
    if (typeof lane.name !== 'string' || lane.name.length === 0) {
      throw new Error(`${sourcePath}: each fleet-knowledge lane requires a non-empty name`);
    }
    if (seen.has(lane.name)) {
      throw new Error(`${sourcePath}: duplicate fleet-knowledge lane '${lane.name}'`);
    }
    if (
      typeof lane.max_prompt_bytes !== 'number' ||
      !Number.isFinite(lane.max_prompt_bytes) ||
      !Number.isInteger(lane.max_prompt_bytes) ||
      lane.max_prompt_bytes < 1
    ) {
      throw new Error(`${sourcePath}: lane '${lane.name}' max_prompt_bytes must be a positive integer`);
    }
    seen.add(lane.name);
    pairs.push([lane.name, lane.max_prompt_bytes]);
  }
  const actual = new Set(pairs.map(([name]) => name));
  const expected = new Set(expectedLaneNames);
  const unknown = Array.from(actual).filter((name) => !expected.has(name)).sort();
  const missing = Array.from(expected).filter((name) => !actual.has(name)).sort();
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(
      `${sourcePath}: fleet-knowledge lanes must exactly match configured barrage lanes` +
        `${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}` +
        `${unknown.length > 0 ? `; unknown: ${unknown.join(', ')}` : ''}`,
    );
  }
  return new Map(pairs);
}

function resolveFleetKnowledgePath(installationRoot: string): string {
  const configPath = configPathFor(installationRoot);
  if (!existsSync(configPath)) {
    return join(installationRoot, '.stack-control', 'fleet-knowledge.yaml');
  }
  const config = loadInstallationConfig(configPath);
  return resolvePaths(installationRoot, config).fleetKnowledge;
}

function binaryExistsOnPath(binary: string): boolean {
  const result = spawnSync('which', [binary], { encoding: 'utf8' });
  return result.status === 0;
}
