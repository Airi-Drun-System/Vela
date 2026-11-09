package com.vegasdev.vela;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VelaUpdate.class);
        super.onCreate(savedInstanceState);
    }
}
