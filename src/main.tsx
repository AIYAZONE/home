import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { usePwaStore } from '@/stores/pwa'
import { useToastStore } from '@/stores/toast'

let updateSW = () => {}

updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    usePwaStore.getState().setNeedRefresh(true)
    usePwaStore.getState().setUpdateSW(updateSW)
    useToastStore
      .getState()
      .push({ variant: 'default', title: '新版本可用', message: '刷新即可更新到最新版本' })
  },
  onOfflineReady() {
    usePwaStore.getState().setOfflineReady(true)
    useToastStore.getState().push({ variant: 'success', title: '离线可用', message: '核心资源已缓存' })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
