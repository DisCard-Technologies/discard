export class Logger {
  private service: string;

  constructor(service: string) {
    this.service = service;
  }

  info(message: string, data?: any): void {
    console.log(`[${new Date().toISOString()}] [${this.service}] INFO: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  error(message: string, error?: any): void {
    console.error(`[${new Date().toISOString()}] [${this.service}] ERROR: ${message}`, error);
  }

  warn(message: string, data?: any): void {
    console.warn(`[${new Date().toISOString()}] [${this.service}] WARN: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  debug(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[${new Date().toISOString()}] [${this.service}] DEBUG: ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }
}