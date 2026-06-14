import { runDesignControlStatus } from '@/status/status';

process.exitCode = runDesignControlStatus(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
