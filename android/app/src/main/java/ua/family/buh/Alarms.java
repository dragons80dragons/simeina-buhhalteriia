package ua.family.buh;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/** Справжні системні нагадування для «Заплановано» — спрацьовують і коли застосунок закритий. */
final class Alarms {
    static final String CH = "plan2";

    static void channel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH) != null) return;
        NotificationChannel ch = new NotificationChannel(CH, "Заплановано — нагадування", NotificationManager.IMPORTANCE_HIGH);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 400, 200, 400, 200, 400});
        ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        nm.createNotificationChannel(ch);
    }

    static PendingIntent pi(Context c, String id, String title, String body) {
        Intent i = new Intent(c, AlarmReceiver.class);
        i.putExtra("id", id); i.putExtra("title", title); i.putExtra("body", body);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Замінює всі будильники новим списком [{id, at, title, body}]. */
    static synchronized void sync(Context c, JSONArray list) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        JSONArray old = Store.arr(c, "alarms");
        for (int i = 0; i < old.length(); i++) {
            JSONObject o = old.optJSONObject(i);
            if (o != null) am.cancel(pi(c, o.optString("id"), "", ""));
        }
        Store.put(c, "alarms", list);
        schedule(c);
    }

    static void schedule(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        JSONArray a = Store.arr(c, "alarms");
        long now = System.currentTimeMillis();
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null) continue;
            long at = o.optLong("at");
            if (at <= now) continue;
            PendingIntent p = pi(c, o.optString("id"), o.optString("title"), o.optString("body"));
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        }
    }
}
