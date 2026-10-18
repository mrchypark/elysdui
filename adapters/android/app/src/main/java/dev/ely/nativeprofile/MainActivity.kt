package dev.ely.nativeprofile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                val model: ProfileViewModel = viewModel()
                val state by model.state.collectAsStateWithLifecycle()
                ProfileScreen(state, model::edit, model::save, model::retry, model::reload, serverEndpoint = BuildConfig.PROFILE_ENDPOINT)
            }
        }
    }
}
