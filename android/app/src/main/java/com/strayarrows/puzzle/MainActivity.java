package com.strayarrows.puzzle;

import android.os.Bundle;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Edge-to-edge: webview draws under status bar and nav bar so the
        // app's gradient background reaches every edge of the screen. The
        // safe-area env() values are still respected by canvas-coord UI
        // (coins, settings gear, back buttons) via the JS probe in resize().
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
