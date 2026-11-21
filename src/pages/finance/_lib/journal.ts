/** 12 → "JV-0012" */
export const jvNumber = (n: number) => `JV-${String(n).padStart(4, "0")}`;
