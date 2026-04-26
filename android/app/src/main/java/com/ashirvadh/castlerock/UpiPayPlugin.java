package com.ashirvadh.castlerock;

import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "UpiPay")
public class UpiPayPlugin extends Plugin {

    @PluginMethod()
    public void pay(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.reject("URI is required");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(uri));

        try {
            startActivityForResult(call, intent, "payResult");
        } catch (Exception e) {
            call.reject("No UPI app found: " + e.getMessage(), e);
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

            if (status != null) ret.put("status", status);
            if (response != null) ret.put("response", response);
            if (txnId != null) ret.put("txnId", txnId);
        }

        call.resolve(ret);
    }
}
