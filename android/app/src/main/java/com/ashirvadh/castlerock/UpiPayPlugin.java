package com.ashirvadh.castlerock;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

@CapacitorPlugin(name = "UpiPay")
public class UpiPayPlugin extends Plugin {

    @PluginMethod()
    public void pay(PluginCall call) {
        String uri = call.getString("uri");
        String pkg = call.getString("package", null);

        if (uri == null || uri.isEmpty()) {
            call.reject("URI is required");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(uri));

        // Target a specific UPI app if package name is provided
        if (pkg != null && !pkg.isEmpty()) {
            intent.setPackage(pkg);
        }

        try {
            // Check if the intent can be resolved
            PackageManager pm = getContext().getPackageManager();
            List<ResolveInfo> activities = pm.queryIntentActivities(intent, 0);

            if (activities.isEmpty()) {
                // If targeted app not found, fall back to chooser
                intent.setPackage(null);
                activities = pm.queryIntentActivities(intent, 0);
                if (activities.isEmpty()) {
                    call.reject("No UPI app installed");
                    return;
                }
            }

            startActivityForResult(call, intent, "payResult");
        } catch (Exception e) {
            call.reject("Failed to open UPI app: " + e.getMessage(), e);
        }
    }

    @ActivityCallback
    private void payResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        JSObject ret = new JSObject();
        ret.put("resultCode", result.getResultCode());

        Intent data = result.getData();
        if (data != null) {
            String status = data.getStringExtra("Status");
            String response = data.getStringExtra("response");
            String txnId = data.getStringExtra("txnId");
            String txnRef = data.getStringExtra("txnRef");

            if (status != null) ret.put("status", status);
            if (response != null) ret.put("response", response);
            if (txnId != null) ret.put("txnId", txnId);
            if (txnRef != null) ret.put("txnRef", txnRef);
        }

        call.resolve(ret);
    }
}
