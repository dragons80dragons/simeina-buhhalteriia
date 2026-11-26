package ua.family.buh;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    WebView web;
    ValueCallback<Uri[]> fileCb;
    Uri cameraUri;
    long dlId = -1;
    SpeechRecognizer sr;
    boolean voicePending = false;

    // ---------- голосовий запис ----------
    void js(String ev, String text) {
        String q = text == null ? "''" : JSONObject.quote(text);
        runOnUiThread(() -> web.evaluateJavascript("window.__voice && __voice('" + ev + "'," + q + ")", null));
    }
    void voiceStart() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            voicePending = true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 3);
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { js("error", ""); Toast.makeText(this, "На телефоні немає розпізнавання мовлення Google", Toast.LENGTH_LONG).show(); return; }
        if (sr != null) sr.destroy();
        sr = SpeechRecognizer.createSpeechRecognizer(this);
        sr.setRecognitionListener(new RecognitionListener() {
            String best(Bundle b) { ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); return r != null && !r.isEmpty() ? r.get(0) : ""; }
            @Override public void onReadyForSpeech(Bundle p) { js("ready", ""); }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float v) { }
            @Override public void onBufferReceived(byte[] b) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onError(int e) { js("error", String.valueOf(e)); }
            @Override public void onResults(Bundle b) { js("final", best(b)); }
            @Override public void onPartialResults(Bundle b) { String t = best(b); if (!t.isEmpty()) js("partial", t); }
            @Override public void onEvent(int t, Bundle b) { }
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "uk-UA");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "uk-UA");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
        sr.startListening(i);
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == 3) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED && voicePending) voiceStart();
            else js("error", "perm");
            voicePending = false;
        }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#EAF1F8"));
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " SimeinaBuhApp/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("pributky.web.app".equals(u.getHost()) || "pributky.firebaseapp.com".equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams fp) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                openChooser(fp.isCaptureEnabled());
                return true;
            }
        });
        String url = Store.SITE;
        String fid = Store.fid(this), me = Store.me(this);
        if (fid.length() >= 24 && !me.isEmpty()) url += "?f=" + fid + "&me=" + me;
        web.loadUrl(url);

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        Alarms.channel(this);
        checkUpdate(false);
        new Thread(() -> Net.flush(getApplicationContext())).start();
        handleIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); handleIntent(i); }
    void handleIntent(Intent i) {
        if (i != null && "lists".equals(i.getStringExtra("tab")))
            web.postDelayed(() -> web.evaluateJavascript("window.__openTab && __openTab('lists')", null), 800);
    }

    @Override protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.__nativeResume && __nativeResume()", null);
    }

    @Override public void onBackPressed() {
        web.evaluateJavascript("window.__back ? window.__back() : false", r -> { if (!"true".equals(r)) moveTaskToBack(true); });
    }

    // ---------- фото чека: камера або файл ----------
    void openChooser(boolean capture) {
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
        Intent cam = null;
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            try {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, "chek_" + System.currentTimeMillis() + ".jpg");
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            } catch (Exception e) { cam = null; }
        } else if (capture) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, 2);
            if (fileCb != null) { fileCb.onReceiveValue(null); fileCb = null; }
            Toast.makeText(this, "Дозволь камеру і натисни «Фото чека» ще раз", Toast.LENGTH_LONG).show();
            return;
        }
        Intent chooser;
        if (capture && cam != null) chooser = cam;
        else {
            chooser = Intent.createChooser(pick, "Чек");
            if (cam != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
        }
        try { startActivityForResult(chooser, 10); }
        catch (Exception e) { if (fileCb != null) { fileCb.onReceiveValue(null); fileCb = null; } }
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != 10 || fileCb == null) return;
        Uri[] out = null;
        if (res == RESULT_OK) {
            if (data != null && data.getData() != null) out = new Uri[]{data.getData()};
            else if (cameraUri != null) out = new Uri[]{cameraUri};
        }
        fileCb.onReceiveValue(out);
        fileCb = null;
    }

    // ---------- оновлення ----------
    void checkUpdate(boolean manual) {
        new Thread(() -> {
            try {
                JSONObject v = new JSONObject(Net.get(Store.SITE + "app/version.json?t=" + System.currentTimeMillis()));
                int code = v.optInt("versionCode");
                if (code > BuildConfig.VERSION_CODE) runOnUiThread(() -> askUpdate(v));
                else if (manual) runOnUiThread(() -> Toast.makeText(this, "У тебе найновіша версія " + BuildConfig.VERSION_NAME, Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                if (manual) runOnUiThread(() -> Toast.makeText(this, "Не вдалося перевірити оновлення", Toast.LENGTH_SHORT).show());
            }
        }).start();
    }

    void askUpdate(JSONObject v) {
        new AlertDialog.Builder(this)
                .setTitle("Є нова версія " + v.optString("versionName"))
                .setMessage(v.optString("notes", "Оновлення «Сімейної бухгалтерії».") + "\n\nДані не зміняться.")
                .setPositiveButton("Оновити", (d, w) -> download(v.optString("url")))
                .setNegativeButton("Пізніше", null)
                .show();
    }

    void download(String url) {
        try {
            DownloadManager dm = getSystemService(DownloadManager.class);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url))
                    .setTitle("Сімейна бухгалтерія — оновлення")
                    .setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "simeina-buh-" + System.currentTimeMillis() + ".apk");
            dlId = dm.enqueue(r);
            Toast.makeText(this, "Завантажую оновлення…", Toast.LENGTH_SHORT).show();
            BroadcastReceiver done = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent i) {
                    if (i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -2) != dlId) return;
                    try { unregisterReceiver(this); } catch (Exception ignored) { }
                    Uri apk = dm.getUriForDownloadedFile(dlId);
                    if (apk == null) { Toast.makeText(c, "Не вдалося завантажити", Toast.LENGTH_LONG).show(); return; }
                    Intent inst = new Intent(Intent.ACTION_VIEW).setDataAndType(apk, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(inst);
                }
            };
            IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(done, f, Context.RECEIVER_EXPORTED);
            else registerReceiver(done, f);
        } catch (Exception e) {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        }
    }

    boolean listenerOn() {
        String flat = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return flat != null && flat.contains(new ComponentName(this, PayListener.class).flattenToString());
    }

    // ---------- міст для сайту ----------
    class Bridge {
        @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public void setIdentity(String fid, String me) {
            if (fid == null || fid.length() < 24 || me == null || me.isEmpty()) return;
            Store.p(MainActivity.this).edit().putString("fid", fid).putString("me", me).apply();
            new Thread(() -> Net.flush(getApplicationContext())).start();
        }
        @JavascriptInterface public boolean notifAccess() { return listenerOn(); }
        @JavascriptInterface public void openNotifAccess() {
            try { startActivity(new Intent("android.settings.NOTIFICATION_LISTENER_SETTINGS")); }
            catch (Exception e) { openAppSettings(); }
        }
        @JavascriptInterface public boolean batteryOk() {
            return getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(getPackageName());
        }
        @JavascriptInterface public void openBattery() {
            try { startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()))); }
            catch (Exception e) { openAppSettings(); }
        }
        @JavascriptInterface public boolean isXiaomi() {
            String m = Build.MANUFACTURER.toLowerCase();
            return m.contains("xiaomi") || m.contains("redmi") || m.contains("poco");
        }
        @JavascriptInterface public void openAutostart() {
            try {
                Intent i = new Intent();
                i.setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
                startActivity(i);
            } catch (Exception e) { openAppSettings(); }
        }
        @JavascriptInterface public void openAppSettings() {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
        }
        @JavascriptInterface public void syncAlarms(String json) {
            try { Alarms.sync(MainActivity.this, new JSONArray(json)); } catch (Exception ignored) { }
        }
        @JavascriptInterface public void testAlarm() {
            try {
                JSONArray a = Store.arr(MainActivity.this, "alarms");
                a.put(new JSONObject().put("id", "test" + System.currentTimeMillis()).put("at", System.currentTimeMillis() + 10000)
                        .put("title", "⏰ Перевірка нагадування").put("body", "Так виглядатимуть нагадування «Заплановано»"));
                Alarms.sync(MainActivity.this, a);
            } catch (Exception ignored) { }
        }
        @JavascriptInterface public void setCards(String list) { Store.p(MainActivity.this).edit().putString("cards", list == null ? "" : list).apply(); }
        @JavascriptInterface public void startVoice() { runOnUiThread(MainActivity.this::voiceStart); }
        @JavascriptInterface public void stopVoice() { runOnUiThread(() -> { if (sr != null) sr.stopListening(); }); }
        @JavascriptInterface public void cancelVoice() { runOnUiThread(() -> { if (sr != null) sr.cancel(); }); }
        @JavascriptInterface public String lastBank() { return Store.arr(MainActivity.this, "lastBank").toString(); }
        @JavascriptInterface public int queued() { return Store.arr(MainActivity.this, "queue").length(); }
        @JavascriptInterface public void checkUpdate() { runOnUiThread(() -> MainActivity.this.checkUpdate(true)); }
    }
}
