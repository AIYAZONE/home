import { create } from 'zustand';

type UpdateSW = (reloadPage?: boolean) => Promise<void> | void;

interface PwaState {
  needRefresh: boolean;
  offlineReady: boolean;
  updateSW?: UpdateSW;
  setNeedRefresh: (value: boolean) => void;
  setOfflineReady: (value: boolean) => void;
  setUpdateSW: (fn?: UpdateSW) => void;
}

export const usePwaStore = create<PwaState>((set) => ({
  needRefresh: false,
  offlineReady: false,
  updateSW: undefined,
  setNeedRefresh: (value) => set({ needRefresh: value }),
  setOfflineReady: (value) => set({ offlineReady: value }),
  setUpdateSW: (fn) => set({ updateSW: fn }),
}));

