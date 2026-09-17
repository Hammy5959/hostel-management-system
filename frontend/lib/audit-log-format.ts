/** Turns an audit log action string like "login.failed" into "Login Failed". */
export function humanizeAction(action: string): string {
  return action.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
