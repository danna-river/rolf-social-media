function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export const log = {
  info(msg: string): void {
    console.log(`[${stamp()}] INFO  ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`[${stamp()}] WARN  ${msg}`);
  },
  error(msg: string): void {
    console.error(`[${stamp()}] ERROR ${msg}`);
  },
};
