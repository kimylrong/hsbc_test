import pino from 'pino';

export const logger = pino({
  base: { service: 'web-portal' },
  level: 'info',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  messageKey: 'message',
});

export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}