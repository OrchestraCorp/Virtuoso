/** Stable Remote failure identities; details contain no connection secrets. */
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'model-connections/invalid': Record<string, never>
    'model-connections/conflict': { expected: number; actual: number }
    'model-connections/not-found': { id: string }
    'model-connections/default-in-use': { id: string }
    'model-connections/credential-unavailable': Record<string, never>
    'model-connections/storage-failed': Record<string, never>
    'model-connections/operation-failed': Record<string, never>
    'model-connections/owner-required': Record<string, never>
  }
}

/** Refuse an invalid operation before a durable change.
 * @param message Actionable diagnostic containing no secret values.
 * @returns the error to throw.
 */
export function invalid(message: string): RemoteError<'model-connections/invalid'> {
  return new RemoteError('model-connections/invalid', message, {})
}
