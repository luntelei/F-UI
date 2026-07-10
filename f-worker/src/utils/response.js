export function ok(data = null) {
  return { code: 0, message: 'ok', data };
}

export function fail(message, code = 1) {
  return { code, message, data: null };
}

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
