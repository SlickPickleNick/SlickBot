class TaskScheduler {
  constructor() {
    this.tasks = new Map();
    this.intervals = new Map();
    this.timeouts = new Set();
    this.runningTasks = new Set();
    this.started = false;
  }

  /**
   * Register a background task with interval, stagger delay, and error boundary.
   */
  registerTask({ name, intervalMs, initialDelayMs = 0, immediate = false, run }) {
    if (!name || typeof run !== 'function') {
      throw new Error(`Invalid task registration: name and run function required.`);
    }

    this.tasks.set(name, {
      name,
      intervalMs: Number(intervalMs) || 60000,
      initialDelayMs: Number(initialDelayMs) || 0,
      immediate: Boolean(immediate),
      run,
      lastRun: null,
      lastDurationMs: null,
      lastError: null,
      runCount: 0,
      errorCount: 0
    });

    return this;
  }

  /**
   * Executes a single task safely with concurrency locking and timing telemetry.
   */
  async executeTask(name, client, logger) {
    const task = this.tasks.get(name);
    if (!task) return;

    if (this.runningTasks.has(name)) {
      // Previous run is still in-flight; skip this tick to avoid task pileup
      return;
    }

    this.runningTasks.add(name);
    const startTime = Date.now();
    task.lastRun = new Date();

    try {
      await task.run(client, logger);
      task.lastError = null;
    } catch (error) {
      task.lastError = error instanceof Error ? error.message : String(error);
      task.errorCount++;
      const errorMessage = `Task [${name}] execution error: ${task.lastError}`;
      if (logger && typeof logger.error === 'function') {
        logger.error(errorMessage, { error });
      } else {
        console.error(errorMessage, error);
      }
    } finally {
      task.lastDurationMs = Date.now() - startTime;
      task.runCount++;
      this.runningTasks.delete(name);
    }
  }

  /**
   * Starts all registered tasks with staggered delays.
   */
  start(client, logger) {
    if (this.started) return;
    this.started = true;

    for (const task of this.tasks.values()) {
      const scheduleInterval = () => {
        const intervalId = setInterval(() => {
          this.executeTask(task.name, client, logger);
        }, task.intervalMs);
        this.intervals.set(task.name, intervalId);
      };

      if (task.initialDelayMs > 0 || task.immediate) {
        const timeoutId = setTimeout(() => {
          this.timeouts.delete(timeoutId);
          if (task.immediate) {
            this.executeTask(task.name, client, logger);
          }
          scheduleInterval();
        }, Math.max(0, task.initialDelayMs));
        this.timeouts.add(timeoutId);
      } else {
        scheduleInterval();
      }
    }
  }

  /**
   * Gracefully stops all task timers and clears background jobs.
   */
  stop() {
    this.started = false;
    for (const timeoutId of this.timeouts) {
      clearTimeout(timeoutId);
    }
    this.timeouts.clear();

    for (const intervalId of this.intervals.values()) {
      clearInterval(intervalId);
    }
    this.intervals.clear();
  }

  /**
   * Returns current health telemetry for all registered background tasks.
   */
  getStatus() {
    return Array.from(this.tasks.values()).map((task) => ({
      name: task.name,
      intervalMs: task.intervalMs,
      isRunning: this.runningTasks.has(task.name),
      runCount: task.runCount,
      errorCount: task.errorCount,
      lastRun: task.lastRun,
      lastDurationMs: task.lastDurationMs,
      lastError: task.lastError
    }));
  }
}

module.exports = { TaskScheduler };
