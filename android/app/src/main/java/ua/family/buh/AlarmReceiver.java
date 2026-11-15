package ua.family.buh;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent in) {
        Alarms.channel(c);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        open.putExtra("tab", "lists");
        PendingIntent pi = PendingIntent.getActivity(c, 7, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = in.getStringExtra("title"), body = in.getStringExtra("body");
        Notification n = new Notification.Builder(c, Alarms.CH)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title == null ? "Нагадування" : title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();
        String id = in.getStringExtra("id");
        c.getSystemService(NotificationManager.class).notify(id == null ? 1 : id.hashCode(), n);
    }
}
