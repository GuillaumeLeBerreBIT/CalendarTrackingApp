import axios from 'axios'
import { useUpgradeStore } from '@/store/upgradeStore'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    // Plan limit hit — surface the global upgrade modal, still reject so
    // callers can handle the failed request normally.
    if (err.response?.status === 403 && err.response.data?.code === 'UPGRADE_REQUIRED') {
      useUpgradeStore.getState().showUpgrade(err.response.data.limit)
    }
    return Promise.reject(err)
  }
)

export default api
