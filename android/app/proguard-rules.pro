# ProGuard rules for Stray Arrows (Capacitor 8 + AdMob).
#
# Goal: shrink + obfuscate the Java code in release APK without breaking
# Capacitor's reflection-based plugin bridge or AdMob's runtime lookups.
# WebView JS bridge uses class names at runtime, so anything reachable from
# JS must be kept untouched.

# --- Crash reporting friendliness ---
# Keep line numbers so Play Console crash stacks point at real lines, then
# hide the original source file name (Google's recommended pair).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- Capacitor core ---
# The bridge enumerates plugin classes by name and uses reflection to call
# annotated methods. Stripping or renaming any of this breaks every JS->native
# call (Status Bar, AdMob, etc).
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.NativePlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}

# --- Capacitor Cordova plugin shim ---
# Cordova plugins (if any are added later via cap add) are loaded by class
# name from config. Keep the package so reflection lookups don't fail.
-keep class org.apache.cordova.** { *; }

# --- WebView JS interfaces ---
# Anything passed to addJavascriptInterface must keep its public methods,
# otherwise window.<name>.foo() throws on the JS side.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# --- Google Play Services / AdMob ---
# AdMob does heavy reflection during init and ad loading.
-keep class com.google.android.gms.** { *; }
-keep class com.google.ads.** { *; }
-dontwarn com.google.android.gms.**

# --- AndroidX (already covered by consumer rules in most cases, but explicit
# is safer for the bits we use directly) ---
-keep class androidx.appcompat.** { *; }
-keep class androidx.core.splashscreen.** { *; }

# --- App package ---
# Capacitor generates a MainActivity that registers plugins. Keep our app
# classes intact — minification won't help much on a thin wrapper anyway.
-keep class com.strayarrows.puzzle.** { *; }
