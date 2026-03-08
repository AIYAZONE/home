import { useEffect, useRef } from 'react';
import { useToastStore } from '@/stores/toast';

export default function PwaNetworkToasts() {
  const push = useToastStore((s) => s.push);
  const initial = useRef(true);

  useEffect(() => {
    const onOnline = () => {
      if (initial.current) return;
      push({ variant: 'success', title: '网络已恢复', message: '已重新连接到网络' });
    };
    const onOffline = () => {
      if (initial.current) return;
      push({ variant: 'warning', title: '网络已断开', message: '当前处于离线状态' });
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    initial.current = false;

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [push]);

  return null;
}

