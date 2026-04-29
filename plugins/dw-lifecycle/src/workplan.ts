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
const BOLD_RE = /^\*\*(.+)\*\*$/;

function stripBold(text: string): string {
  const m = BOLD_RE.exec(text);
  return m?.[1] ?? text;
}

export function parseWorkplan(source: string): ParsedWorkplan {
  const lines = source.split('\n');
  const tasks: WorkplanTask[] = [];
  let currentTask: WorkplanTask | null = null;

  for (const line of lines) {
    const taskMatch = TASK_HEADER_RE.exec(line);
    const taskTitle = taskMatch?.[1];
    if (taskTitle !== undefined) {
      currentTask = { title: stripBold(taskTitle), steps: [] };
      tasks.push(currentTask);
      continue;
    }
    if (!currentTask) continue;
    const stepMatch = STEP_RE.exec(line);
    const marker = stepMatch?.[1];
    const stepText = stepMatch?.[2];
    if (marker !== undefined && stepText !== undefined) {
      currentTask.steps.push({ done: marker === 'x', text: stripBold(stepText) });
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
  let taskFound = false;
  let stepFound = false;
  const targetStep = stripBold(args.step);
  const targetTask = stripBold(args.task);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const taskMatch = TASK_HEADER_RE.exec(line);
    const taskTitle = taskMatch?.[1];
    if (taskTitle !== undefined) {
      const normalizedTitle = stripBold(taskTitle);
      inTask = normalizedTitle === targetTask;
      if (inTask) taskFound = true;
      continue;
    }
    if (!inTask) continue;
    const stepMatch = STEP_RE.exec(line);
    const stepText = stepMatch?.[2];
    if (stepText !== undefined && stripBold(stepText) === targetStep) {
      stepFound = true;
      lines[i] = line.replace('[ ]', '[x]');
    }
  }

  if (!taskFound) {
    throw new Error('Task not found in workplan: ' + args.task);
  }
  if (!stepFound) {
    throw new Error('Step not found in task "' + args.task + '": ' + args.step);
  }

  return lines.join('\n');
}
