package dev.ely.nativeprofile

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException

class ProfileViewModel(endpoint: String = BuildConfig.PROFILE_ENDPOINT) : ViewModel() {
    private val client = ProfileHttpClient(endpoint, BuildConfig.DEBUG)
    private val mutableState = MutableStateFlow(ProfileState())
    val state = mutableState.asStateFlow()

    init { reload() }

    fun edit(field: String, value: String) { mutableState.value = mutableState.value.edit(field, value) }

    /** Called at startup, or after the user explicitly accepts discarding drafts. */
    fun reload() {
        val id = ProfileProtocol.newRequestID()
        mutableState.value = mutableState.value.beginLoad(id)
        viewModelScope.launch {
            try {
                val reply = withContext(Dispatchers.IO) { client.load(id) }
                mutableState.value = mutableState.value.completeLoad(id, reply)
            } catch (e: CancellationException) { throw e }
            catch (e: ProtocolException) {
                logDemoFailure("load", e)
                mutableState.value = mutableState.value.failLoad(id, e.message ?: "Unsupported screen.")
            }
            catch (e: IOException) {
                logDemoFailure("load", e)
                mutableState.value = mutableState.value.failLoad(id, "Unable to load the profile. Check the demo server and try again.")
            }
        }
    }

    fun save() {
        val next = mutableState.value.beginSave()
        if (next == mutableState.value) return
        mutableState.value = next
        sendPending()
    }

    fun retry() {
        val next = mutableState.value.retrySave()
        if (next == mutableState.value) return
        mutableState.value = next
        sendPending()
    }

    private fun sendPending() {
        val pending = mutableState.value.pending ?: return
        val id = pending.request.requestID
        viewModelScope.launch {
            try {
                val reply = withContext(Dispatchers.IO) { client.save(pending) }
                mutableState.value = mutableState.value.completeSave(id, reply)
            } catch (e: CancellationException) { throw e }
            catch (e: ProtocolException) {
                logDemoFailure("save", e)
                mutableState.value = mutableState.value.hardFailed(id, e.message ?: "Unsupported server response. Reload to continue.")
            }
            catch (e: IOException) {
                logDemoFailure("save", e)
                mutableState.value = mutableState.value.networkFailed(id)
            }
        }
    }

    private fun logDemoFailure(operation: String, error: Exception) {
        // Debug diagnostics only: do not log request bodies, cookies, or CSRF tokens.
        if (BuildConfig.DEBUG) Log.w("ElyNativeTransport", "Profile $operation failed", error)
    }
}
