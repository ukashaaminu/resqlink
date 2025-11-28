export const log = (label: string, payload: unknown) => {
  // Keep logging minimal and centralized for future remote logging.
  // eslint-disable-next-line no-console
  console.log(`[${label}]`, payload);
};
