const { spawn } = require('child_process');
const path = require('path');

const children = [];
let shuttingDown = false;

function startProcess(name, command, args) {
  const child = spawn(command, args, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: false,
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    stopChildren(child);

    if (signal) {
      console.error(`${name} exited with signal ${signal}`);
      process.exit(1);
    }

    process.exit(code ?? 1);
  });

  children.push(child);
  return child;
}

function stopChildren(exitedChild) {
  for (const child of children) {
    if (child === exitedChild || child.killed) {
      continue;
    }

    try {
      child.kill('SIGTERM');
    } catch {}
  }
}

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopChildren();
  process.exit(0);
}
function startCommand(name, commandLine) {
  if (process.platform === 'win32') {
    return startProcess(name, 'cmd.exe', ['/d', '/s', '/c', commandLine]);
  }

  return startProcess(name, 'sh', ['-lc', commandLine]);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startCommand('websocket server', 'node ws-server.js');
startCommand('next dev server', 'npm run dev:next');
