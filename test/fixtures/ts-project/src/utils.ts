export const MAX_RETRIES = 3;

export function formatGreeting(name: string): string {
  return `Hello, ${name}!`;
}

export function createUser(name: string) {
  return { name, greeting: formatGreeting(name) };
}

function _internalHelper() {
  return true;
}
