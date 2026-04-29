package com.strayarrows.puzzle;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Edge-to-edge: webview occupies the entire screen, including the area
        // behind the status bar and the navigation bar. The app's gradient
        // background reaches every edge — system chrome (clock, battery, nav
        // pills) is drawn translucently on top of our content.
        Window window = getWindow();

        // Tell Android NOT to inset content for system bars (the modern API).
        // On API 30+ this is the canonical way; AndroidX provides a back-compat
        // shim for older versions.
        WindowCompat.setDecorFitsSystemWindows(window, false);

        // Make status & nav bars fully transparent so the app gradient shows
        // through completely. Without this Android 8/9/10 paint a translucent
        // scrim. We already declared windowDrawsSystemBarBackgrounds=true in
        // the theme so these calls take effect.
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        // Belt-and-suspenders for Android 9 and earlier: explicit layout flags
        // ensure the decor view extends behind the bars even on devices that
        // don't honor the AndroidX call. Harmless on newer versions.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            View decorView = window.getDecorView();
            decorView.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            );
        }

        // Disable the auto-applied scrim that some Android versions overlay on
        // gesture nav (the thin grey bar at the bottom). Available API 29+.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        // Some OEM ROMs default the legacy translucent flags on; clear them.
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        // Tell window to draw under the bars (mirror of theme attr — explicit
        // here so it survives even if a parent theme is overridden).
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
    }
}
