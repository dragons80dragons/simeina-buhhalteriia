package ua.family.buh;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/** Ловить сповіщення банківських застосунків і передає їх текст у «Сімейну бухгалтерію». */
public class PayListener extends NotificationListenerService {
    static boolean isBank(String pkg) {
        return pkg.startsWith("ua.privatbank") || pkg.equals("com.ftband.mono");
    }

    @Override public void onListenerConnected() {
        new Thread(() -> Net.flush(getApplicationContext())).start();
    }

    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (!isBank(pkg)) return;
            Notification n = sbn.getNotification();
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle e = n.extras;
            CharSequence title = e.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence big = e.getCharSequence(Notification.EXTRA_BIG_TEXT);
            CharSequence txt = e.getCharSequence(Notification.EXTRA_TEXT);
            String text = ((title != null ? title + " " : "") + (big != null ? big : txt != null ? txt : "")).trim();
            if (text.isEmpty()) return;
            if (Store.seen(this, pkg + "|" + text)) return;   // те саме сповіщення оновилось — не дублюємо
            long at = sbn.getPostTime() / 1000;
            Store.remember(this, pkg, text, sbn.getPostTime());
            Store.enqueue(this, text, at);
            new Thread(() -> Net.flush(getApplicationContext())).start();
        } catch (Exception ignored) { }
    }
}
