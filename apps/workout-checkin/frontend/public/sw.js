self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: '운동 출석 알림', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || '운동 출석 알림';
  const options = {
    body: data.body || '오늘 운동 사진 출석 잊지 마세요.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'workout-checkin-reminder',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(url);
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(url);
  })());
});
