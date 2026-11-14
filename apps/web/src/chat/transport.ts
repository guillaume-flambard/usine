/**
 * The chat transport: `DefaultChatTransport` on `/api/chat`, with failures of
 * the service itself said in French.
 *
 * Errors of a run arrive in the stream, already readable (MEM-14). But when the
 * service is down or answers an HTTP error, ai@7.0.165 shows the response body,
 * or "Failed to fetch the chat response." (`createUIApiCallError`). Seen on
 * 2026-11-14 with the API not yet started: an English sentence on a French page.
 */
import { DefaultChatTransport, type UIMessage } from 'ai'

export const SERVICE_UNREACHABLE =
  "Le service de l'usine est injoignable. Réessayez dans un instant."

export function serviceError(status: number): string {
  return `Le service de l'usine a répondu par une erreur ${status}. Réessayez dans un instant.`
}

export function chatTransport(
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport({
    api: '/api/chat',
    fetch: async (input, init) => {
      let response: Response
      try {
        response = await fetchImpl(input, init)
      } catch (error) {
        // Stopping a run aborts the request: that is not a failure to report.
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        throw new Error(SERVICE_UNREACHABLE)
      }
      if (!response.ok) throw new Error(serviceError(response.status))
      return response
    },
  })
}
