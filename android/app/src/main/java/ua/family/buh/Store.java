package ua.family.buh;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Невелике сховище: ключ сім'ї, хто власник телефону, черга сповіщень, будильники. */
final class Store {
    static final String PROJECT = "pributky";
    static final String API_KEY = "AIzaSyDP_WFsgymbtl2nnzgVu_hDwh2uCBazlAM";
    static final String SITE = "https://pributky.web.app/";

    static SharedPreferences p(Context c) { return c.getSharedPreferences("buh", Context.MODE_PRIVATE); }
    static String fid(Context c) { return p(c).getString("fid", ""); }
    static String me(Context c) { return p(c).getString("me", ""); }

    static JSONArray arr(Context c, String k) {
        try { return new JSONArray(p(c).getString(k, "[]")); } catch (Exception e) { return new JSONArray(); }
    }
    static void put(Context c, String k, JSONArray a) { p(c).edit().putString(k, a.toString()).apply(); }

    static synchronized void enqueue(Context c, String text, long atSec) {
        try {
            JSONArray q = arr(c, "queue");
            JSONObject o = new JSONObject();
            o.put("text", text); o.put("at", atSec);
            q.put(o);
            while (q.length() > 200) q.remove(0);
            put(c, "queue", q);
        } catch (Exception ignored) { }
    }

    /** Останні сповіщення банку — щоб у застосунку було видно, що саме прийшло. */
    static synchronized void remember(Context c, String pkg, String text, long at) {
        try {
            JSONArray a = arr(c, "lastBank");
            JSONObject o = new JSONObject();
            o.put("pkg", pkg); o.put("text", text); o.put("at", at);
            a.put(o);
            while (a.length() > 20) a.remove(0);
            put(c, "lastBank", a);
        } catch (Exception ignored) { }
    }

    static synchronized boolean seen(Context c, String key) {
        JSONArray a = arr(c, "seen");
        for (int i = 0; i < a.length(); i++) if (key.equals(a.optString(i))) return true;
        a.put(key);
        while (a.length() > 60) a.remove(0);
        put(c, "seen", a);
        return false;
    }
}
