const test = require('node:test');
const assert = require('node:assert/strict');
const { TaskScheduler } = require('../../src/services/taskScheduler');

test('TaskScheduler: registers and lists tasks correctly', () => {
  const scheduler = new TaskScheduler();
  scheduler.registerTask({
    name: 'testTask',
    intervalMs: 1000,
    run: async () => {}
  });

  const status = scheduler.getStatus();
  assert.equal(status.length, 1);
  assert.equal(status[0].name, 'testTask');
  assert.equal(status[0].intervalMs, 1000);
  assert.equal(status[0].isRunning, false);
});

test('TaskScheduler: executes task safely and tracks telemetry', async () => {
  const scheduler = new TaskScheduler();
  let executed = 0;

  scheduler.registerTask({
    name: 'counter',
    intervalMs: 1000,
    run: async () => {
      executed++;
    }
  });

  await scheduler.executeTask('counter', null, null);
  assert.equal(executed, 1);

  const status = scheduler.getStatus()[0];
  assert.equal(status.runCount, 1);
  assert.equal(status.errorCount, 0);
  assert.ok(status.lastRun instanceof Date);
});

test('TaskScheduler: catches errors without crashing and records telemetry', async () => {
  const scheduler = new TaskScheduler();
  const errorsLogged = [];

  const fakeLogger = {
    error: (msg) => errorsLogged.push(msg)
  };

  scheduler.registerTask({
    name: 'failingTask',
    intervalMs: 1000,
    run: async () => {
      throw new Error('Database connection timed out');
    }
  });

  await scheduler.executeTask('failingTask', null, fakeLogger);

  const status = scheduler.getStatus()[0];
  assert.equal(status.runCount, 1);
  assert.equal(status.errorCount, 1);
  assert.equal(status.lastError, 'Database connection timed out');
  assert.equal(errorsLogged.length, 1);
});

test('TaskScheduler: concurrency lock prevents overlapping execution', async () => {
  const scheduler = new TaskScheduler();
  let concurrentExecutions = 0;
  let maxConcurrent = 0;

  scheduler.registerTask({
    name: 'slowTask',
    intervalMs: 100,
    run: async () => {
      concurrentExecutions++;
      maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);
      await new Promise((resolve) => setTimeout(resolve, 50));
      concurrentExecutions--;
    }
  });

  // Launch two task executions concurrently
  const p1 = scheduler.executeTask('slowTask', null, null);
  const p2 = scheduler.executeTask('slowTask', null, null);
  await Promise.all([p1, p2]);

  assert.equal(maxConcurrent, 1, 'Max concurrent executions should never exceed 1');
});

test('TaskScheduler: starts and stops cleanly', () => {
  const scheduler = new TaskScheduler();
  scheduler.registerTask({
    name: 'periodic',
    intervalMs: 500,
    initialDelayMs: 100,
    immediate: true,
    run: async () => {}
  });

  scheduler.start(null, null);
  assert.equal(scheduler.started, true);

  scheduler.stop();
  assert.equal(scheduler.started, false);
  assert.equal(scheduler.timeouts.size, 0);
  assert.equal(scheduler.intervals.size, 0);
});
