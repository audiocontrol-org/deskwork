// src/workplan.ts
export interface WorkplanStep {
  done: boolean;
  text: string;
}

export interface WorkplanTask {
  title: string;
  steps: WorkplanStep[];
}

export interface ParsedWorkplan {
  tasks: WorkplanTask[];
}

const TASK_HEADER_RE = /^### (Task .+)$/;
const STEP_RE = /^- \[( |x)\] (.+)$/;

export function parseWorkplan(source: string): ParsedWorkplan {
  const lines = source.split('\n');
  const tasks: WorkplanTask[] = [];
  let currentTask: WorkplanTask | null = null;

  for (const line of lines) {
    const taskMatch = TASK_HEADER_RE.exec(line);
    const taskTitle = taskMatch?.[1];
    if (taskTitle !== undefined) {
      currentTask = { title: taskTitle, steps: [] };
      tasks.push(currentTask);
      continue;
    }
    if (!currentTask) continue;
    const stepMatch = STEP_RE.exec(line);
    const marker = stepMatch?.[1];
    const stepText = stepMatch?.[2];
    if (marker !== undefined && stepText !== undefined) {
      currentTask.steps.push({ done: marker === 'x', text: stepText });
    }
  }

  return { tasks };
}

export interface MarkStepArgs {
  task: string;
  step: string;
}

export function markStepDone(source: string, args: MarkStepArgs): string {
  const lines = source.split('\n');
  let inTask = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const taskMatch = TASK_HEADER_RE.exec(line);
    const taskTitle = taskMatch?.[1];
    if (taskTitle !== undefined) {
      inTask = taskTitle === args.task;
      continue;
    }
    if (!inTask) continue;
    const stepMatch = STEP_RE.exec(line);
    const stepText = stepMatch?.[2];
    if (stepText !== undefined && stepText === args.step) {
      lines[i] = `- [x] ${stepText}`;
    }
  }

  return lines.join('\n');
}
