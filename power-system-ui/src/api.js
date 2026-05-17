import axios from 'axios'

// Dev: Vite proxy → 127.0.0.1:8000
// Prod: VITE_API_URL env variable set in Vercel → Render backend
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '' })

// Strip frontend-only fields before sending to backend
function apiPayload(network) {
  // eslint-disable-next-line no-unused-vars
  const { circuit_breakers, ...rest } = network
  return rest
}

export const runLoadflow = (network) =>
  api.post('/loadflow/run', apiPayload(network)).then((r) => r.data)

export const runShortcircuit = (network) =>
  api.post('/shortcircuit/run', apiPayload(network)).then((r) => r.data)

export const runShortcircuitCycles = (network) =>
  api.post('/shortcircuit/cycles', apiPayload(network)).then((r) => r.data)
