import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { loadAccount } from '@/lib/account';

/** 启动入口: 根据"默认起始页"设置分发到主站或课表 */
export default function IndexGate() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      try {
        const acc = await loadAccount();
        router.replace(acc?.startPage === 'timetable' ? '/timetable' : '/home');
      } catch {
        router.replace('/home');
      }
    })();
  }, [router]);
  return null;
}
