import { createUser, formatGreeting } from './utils';

export class UserService {
  getUser(name: string) {
    return createUser(name);
  }

  greet(name: string) {
    return formatGreeting(name);
  }
}

export function main() {
  const service = new UserService();
  console.log(service.getUser('World'));
}
