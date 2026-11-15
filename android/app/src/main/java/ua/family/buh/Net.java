package ua.family.buh;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class Net {
    static String get(String url) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(10000); h.setReadTimeout(15000);
        h.setRequestProperty("Cache-Control", "no-cache");
        try (InputStream in = h.getInputStream()) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        } finally { h.disconnect(); }
    }

    static boolean postInbox(String fid, String who, String text, long atSec) {
        try {
            JSONObject f = new JSONObject();
            f.put("who", new JSONObject().put("stringValue", who));
            f.put("at", new JSONObject().put("stringValue", String.valueOf(atSec)));
            f.put("text", new JSONObject().put("stringValue", text));
            byte[] body = new JSONObject().put("fields", f).toString().getBytes(StandardCharsets.UTF_8);
            URL u = new URL("https://firestore.googleapis.com/v1/projects/" + Store.PROJECT
                    + "/databases/(default)/documents/families/" + fid + "/inbox?key=" + Store.API_KEY);
            HttpURLConnection h = (HttpURLConnection) u.openConnection();
            h.setRequestMethod("POST"); h.setDoOutput(true);
            h.setConnectTimeout(10000); h.setReadTimeout(15000);
            h.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            try (OutputStream o = h.getOutputStream()) { o.write(body); }
            int code = h.getResponseCode();
            h.disconnect();
            return code >= 200 && code < 300;
        } catch (Exception e) { return false; }
    }

    /** Надсилає все, що накопичилось у черзі (напр., оплата без інтернету). */
    static synchronized void flush(Context c) {
        String fid = Store.fid(c), me = Store.me(c);
        if (fid.length() < 24 || me.isEmpty()) return;
        JSONArray q = Store.arr(c, "queue"), rest = new JSONArray();
        for (int i = 0; i < q.length(); i++) {
            JSONObject o = q.optJSONObject(i);
            if (o == null) continue;
            if (!postInbox(fid, me, o.optString("text"), o.optLong("at"))) rest.put(o);
        }
        Store.put(c, "queue", rest);
    }
}
