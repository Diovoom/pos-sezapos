package com.sezapos.security;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SezaSecureStorage")
public class SezaSecureStoragePlugin extends Plugin {
    private static final String KEY_ALIAS = "seza_pos_pairing_key_v1";
    private static final String PREFS = "seza_secure_storage";
    private static final String PAIRING_RECORD = "pairing_record_v1";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";

    @PluginMethod
    public void savePairing(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.isEmpty()) {
            call.reject("value is required");
            return;
        }
        try {
            getPrefs().edit().putString(PAIRING_RECORD, encrypt(value)).commit();
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to protect pairing record", error);
        }
    }

    @PluginMethod
    public void loadPairing(PluginCall call) {
        try {
            String encrypted = getPrefs().getString(PAIRING_RECORD, null);
            JSObject result = new JSObject();
            result.put("value", encrypted == null ? null : decrypt(encrypted));
            call.resolve(result);
        } catch (Exception error) {
            // A restored/corrupt ciphertext must never be reused with a new
            // Keystore key. Clear it and require a deliberate re-pair.
            getPrefs().edit().remove(PAIRING_RECORD).apply();
            call.reject("Stored pairing record is unreadable; re-pair this register", error);
        }
    }

    @PluginMethod
    public void clearPairing(PluginCall call) {
        getPrefs().edit().remove(PAIRING_RECORD).apply();
        call.resolve();
    }

    private SharedPreferences getPrefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            KeyStore.SecretKeyEntry entry = (KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null);
            return entry.getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private String encrypt(String plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);
        String body = Base64.encodeToString(ciphertext, Base64.NO_WRAP);
        return iv + ":" + body;
    }

    private String decrypt(String encoded) throws Exception {
        String[] parts = encoded.split(":", 2);
        if (parts.length != 2) throw new IllegalArgumentException("Invalid secure record");
        byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
        byte[] ciphertext = Base64.decode(parts[1], Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }
}
