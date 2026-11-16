export class MoveitApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'MoveitApiError';
    this.status = status;
    this.detail = detail;
  }
}
