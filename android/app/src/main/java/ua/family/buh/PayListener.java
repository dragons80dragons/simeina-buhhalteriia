package ua.family.buh;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/** Ловить сповіщення банківських застосунків і передає їх текст у «Сімейну бухгалтерію». */
public class PayListener extends NotificationListenerService {
    static boolean isBank(String pkg) {
        String p = pkg.toLowerCase();
        return p.startsWith("ua.privatbank") || p.equals("com.ftband.mono") || p.contains("ukrgas") || p.contains("ugb")
                || p.contains("bank") || p.equals("com.google.android.apps.walletnfcrel") || p.equals("com.google.android.gms");
    }
    static boolean isSms(String pkg) {
        String p = pkg.toLowerCase();
        return p.contains("messaging") || p.contains(".mms") || p.equals("com.android.mms") || p.contains("sms");
    }

    @Override public void onListenerConnected() {
        new Thread(() -> Net.flush(getApplicationContext())).start();
    }

    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            boolean sms = isSms(pkg);
            if (!isBank(pkg) && !sms) return;
            Notification n = sbn.getNotification();
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle e = n.extras;
            CharSequence title = e.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence big = e.getCharSequence(Notification.EXTRA_BIG_TEXT);
            CharSequence txt = e.getCharSequence(Notification.EXTRA_TEXT);
            String text = ((title != null ? title + " " : "") + (big != null ? big : txt != null ? txt : "")).trim();
            if (text.isEmpty()) return;
            boolean money = text.matches("(?s).*(грн|UAH|₴).*");
            // від Google Гаманця беремо лише сповіщення з сумою в гривнях
            if (pkg.startsWith("com.google") && !money) return;
            // SMS — лише банківські: з сумою і з номером картки сім'ї
            if (sms) {
                if (!money) return;
                boolean card = false;
                for (String c : Store.p(this).getString("cards", "").split(",")) if (c.length() == 4 && text.contains(c)) card = true;
                if (!card) return;
            }
            if (Store.seen(this, pkg + "|" + text)) return;   // те саме сповіщення оновилось — не дублюємо
            long at = sbn.getPostTime() / 1000;
            Store.remember(this, pkg, text, sbn.getPostTime());
            Store.enqueue(this, text, at);
            new Thread(() -> Net.flush(getApplicationContext())).start();
        } catch (Exception ignored) { }
    }
}
