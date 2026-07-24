package com.sezapos.share;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Small first-party PDF sharing plugin for SEZA POS.
 *
 * It replaces the much larger Filesystem plugin for the single native feature
 * the APK needs: sharing a generated shift-summary PDF. The PDF is written to
 * the app's private cache and exposed through the app FileProvider.
 */
@CapacitorPlugin(name = "SezaPdfShare")
public class SezaPdfSharePlugin extends Plugin {
    private static String safeFilename(String input) {
        String name = input == null ? "SEZA-Shift-Summary.pdf" : input.trim();
        name = name.replaceAll("[^A-Za-z0-9._-]", "-");
        if (name.isEmpty()) name = "SEZA-Shift-Summary.pdf";
        if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
        return name.length() > 120 ? name.substring(0, 116) + ".pdf" : name;
    }

    @PluginMethod
    public void sharePdf(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null || base64.isEmpty()) {
            call.reject("PDF data is missing.");
            return;
        }

        try {
            Context context = getContext();
            File directory = new File(context.getCacheDir(), "seza-shared-reports");
            if (!directory.exists() && !directory.mkdirs()) {
                call.reject("Could not create the report cache folder.");
                return;
            }

            File report = new File(directory, safeFilename(call.getString("filename")));
            byte[] bytes = Base64.decode(base64.getBytes(StandardCharsets.US_ASCII), Base64.DEFAULT);
            try (FileOutputStream stream = new FileOutputStream(report, false)) {
                stream.write(bytes);
                stream.flush();
            }

            Uri uri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                report
            );

            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType("application/pdf");
            share.putExtra(Intent.EXTRA_STREAM, uri);
            share.putExtra(Intent.EXTRA_SUBJECT, call.getString("title", "SEZA Shift Summary"));
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(
                share,
                call.getString("dialogTitle", "Share shift summary")
            );
            if (getActivity() != null) {
                getActivity().startActivity(chooser);
            } else {
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(chooser);
            }

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (IllegalArgumentException error) {
            call.reject("The generated PDF data was invalid.", error);
        } catch (Exception error) {
            call.reject("The PDF could not be shared.", error);
        }
    }
}
