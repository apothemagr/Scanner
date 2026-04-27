export const API = '/api'

export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...options, credentials: 'include' })
}

export const apiFetch = authFetch
