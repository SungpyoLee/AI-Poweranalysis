import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '' })

function apiPayload(network: Record<string, unknown>) {
  const { circuit_breakers: _, ...rest } = network
  return rest
}

export const runLoadflow = (network: Record<string, unknown>) =>
  api.post('/loadflow/run', apiPayload(network)).then(r => r.data)

export const runShortcircuit = (network: Record<string, unknown>) =>
  api.post('/shortcircuit/run', apiPayload(network)).then(r => r.data)

export const runShortcircuitCycles = (network: Record<string, unknown>) =>
  api.post('/shortcircuit/cycles', apiPayload(network)).then(r => r.data)
