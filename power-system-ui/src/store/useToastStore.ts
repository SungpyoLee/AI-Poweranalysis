import { create } from 'zustand'

export type ToastType = 'error' | 'warn' | 'success' | 'info'

export interface Toast {
  id:      string
  message: string
  type:    ToastType
}

interface ToastStore {
  toasts: Toast[]
  show:    (message: string, type?: ToastType, durationMs?: number) => void
  dismiss: (id: string) => void
}

let _seq = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  show: (message, type = 'info', durationMs = 3200) => {
    const id = `toast-${++_seq}`
    set(s => ({ toasts: [...s.toasts.slice(-4), { id, message, type }] }))
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
    }, durationMs)
  },

  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))

/** 스토어 밖에서도 호출 가능한 헬퍼 */
export const showToast = (message: string, type: ToastType = 'info', durationMs?: number) =>
  useToastStore.getState().show(message, type, durationMs)
