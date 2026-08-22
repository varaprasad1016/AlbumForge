package com.albumforge.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdateInstaller.class);
        super.onCreate(savedInstanceState);
    }
}
